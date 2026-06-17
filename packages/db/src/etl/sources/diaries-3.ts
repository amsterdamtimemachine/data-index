/**
 * Example: Ingesting a dataset without Adamlink references
 *
 * Use this template when your source data only has coordinates (WKT geometry
 * points) and does not reference Adamlink address URIs. The script matches
 * each geometry to the nearest existing place within a configurable distance
 * threshold. Features with no nearby place are skipped.
 *
 * To use:
 * 1. Copy to packages/db/src/etl/sources/<your-dataset>.ts
 * 2. Fill in the Organisation / Dataset / Feature metadata blocks at the top
 *    (and tune MATCH_THRESHOLD_METERS for your data)
 * 3. Adjust RawRow to match your CSV/JSON structure
 * 4. Adjust the entity type and field mapping
 * 5. Run: bun run db:ingest -s <your-dataset> -f <path-to-file>
 */
import { createReadStream } from 'fs';
import { parse } from 'csv-parse';
import { sql } from 'drizzle-orm';
import { db } from '../../client';
import { organisations, datasets, relation, features, featureToPlace } from '../../schema';
import type { CreativeWorkEntity } from '@atm/shared';
import { formatDateRange } from '../utils';
import { readFile } from 'fs/promises';

// ═══════════════════════════════════════════════════════════════
//  Organisation
// ═══════════════════════════════════════════════════════════════
const ORG_ID = 'amsterdam-museum';
const ORG_LABEL = 'Amsterdam Museum';
const ORG_URL = 'https://www.amsterdammuseum.nl/';

// ═══════════════════════════════════════════════════════════════
//  Dataset
// ═══════════════════════════════════════════════════════════════
const DATASET_ID = 'diaries';
const DATASET_LABEL = 'Diaries';
const DATASET_URL = '-';

// ═══════════════════════════════════════════════════════════════
//  Feature metadata
// ═══════════════════════════════════════════════════════════════
const RECORD_TYPE = 'text'; // 'image' | 'text' | 'person'
const RELATION_ID = 'isAbout';
const RELATION_LABEL = 'Is About';

// ═══════════════════════════════════════════════════════════════
//  Ingestion tuning
// ═══════════════════════════════════════════════════════════════
/** Max distance in meters to match a geometry to an existing place.
 *  Increase for less precise coordinates, decrease for denser areas. */
const MATCH_THRESHOLD_METERS = 1000;
const BATCH_SIZE = 1000;

interface RawRow {
  identifier: string;
  "@id": string;
  headline: string;
  articleBody: string;
  url: string;
  datePublished: string;
}

type PlaceMatch = { place_id: string };

export async function ingest(filePath: string) {
  await db.insert(organisations)
    .values({ id: ORG_ID, label: ORG_LABEL, url: ORG_URL })
    .onConflictDoNothing();

  await db.insert(datasets)
    .values({ id: DATASET_ID, label: DATASET_LABEL, url: DATASET_URL, organisationId: ORG_ID })
    .onConflictDoNothing();

  await db.insert(relation)
    .values({ id: RELATION_ID, label: RELATION_LABEL })
    .onConflictDoNothing();

  console.log(`Match threshold: ${MATCH_THRESHOLD_METERS}m`);

  // Cache: WKT → place ID (many rows often share the same geometry)
  const placeCache = new Map<string, string | null>();

  async function resolvePlaceId(wkt: string): Promise<string | null> {
    if (placeCache.has(wkt)) return placeCache.get(wkt)!;
    
    const result = await db.execute<PlaceMatch>(sql`
      SELECT p.id as place_id
      FROM place p
      WHERE ST_DWithin(
        p.geometry,
        ST_Transform(ST_GeomFromText(${wkt}, 4326), 28992),
        ${MATCH_THRESHOLD_METERS}
      )
      ORDER BY p.geometry <-> ST_Transform(ST_GeomFromText(${wkt}, 4326), 28992)
      LIMIT 1
    `);

    const placeId = result.rows[0]?.place_id || null;
    placeCache.set(wkt, placeId);
    return placeId;
  }

  const raw = await readFile(filePath, "utf-8");
  const rows: RawRow[] = JSON.parse(raw);

  let featureBatch: any[] = [];
  let linkBatch: { featureId: string; placeId: string; relationId: string }[] = [];
  let count = 0;
  let skipped = 0;

  async function flush() {
    if (featureBatch.length > 0) {
      await db.insert(features).values(featureBatch).onConflictDoNothing();
      featureBatch = [];
    }
    if (linkBatch.length > 0) {
      await db.insert(featureToPlace).values(linkBatch).onConflictDoNothing();
      linkBatch = [];
    }
  }

  for await (const row of rows) {
    const geom_wkt = await extractGeomWktFromText(row.articleBody)
    
    if (geom_wkt.length == 0) continue;

    const placeId = await resolvePlaceId(geom_wkt[0]); // TODO: there could be multiple geoms in text
    if (!placeId) { skipped++; continue; }

    const featureId = crypto.randomUUID();
    const startDate = `${row.datePublished}-01-01`;
    const endDate = `${row.datePublished}-01-01`;
    const dateCreated = formatDateRange(startDate, endDate);

    const entity: CreativeWorkEntity = {
      type: 'CreativeWork',
      title: row.headline || '',
      url: row.url,
      ...(dateCreated && { dateCreated })
    };

    featureBatch.push({
      id: featureId,
      url: row['@id'],
      recordType: RECORD_TYPE,
      label: row.headline || '',
      description: row.articleBody,
      contentUrl: row['@id'],
      startDate,
      endDate,
      datasetId: DATASET_ID,
      entity
    });

    linkBatch.push({ featureId, placeId, relationId: RELATION_ID });
    count++;

    if (featureBatch.length >= BATCH_SIZE) await flush();
    if ((count + skipped) % 1000 === 0) {
      process.stdout.write(`\r  ${count} ingested, ${skipped} skipped, ${placeCache.size} geometries cached`);
    }
  }

  await flush();
  console.log(`\nDone: ${count} features, ${skipped} skipped (no place within ${MATCH_THRESHOLD_METERS}m)`);
}

// ═══════════════════════════════════════════════════════════════
//  Places
// ═══════════════════════════════════════════════════════════════
/** Places found in data-set, extracted by feeding data-set into LLM 
 *  alongside the prompt 'extract all the places (streets, district,
 *  addresses, etc) for me and insert into a simple array'. */
let placesGeomLookup: Record<string, string> = {}
const places = [
  "Beatrixpark", "Vondelpark", "Oosterpark", "Erasmuspark", "Noorderpark",
  "Sarphatipark", "Gaasperpark", "Amsterdamse Bos", "Park Frankendael",
  "J.W. van Overloopplantsoen", "Jordaan", "De Pijp", "Amsterdam-Noord",
  "Amsterdam-Oost", "Bijlmer", "Amsterdam-West", "Amsterdam Nieuw-West",
  "Bos en Lommer", "Vogelbuurt", "Watergraafsmeer", "Rivierenbuurt",
  "Kattenburg", "Oud-Zuid", "Schinkelbuurt", "Oostenburg", "Sloten", "Zuidas",
  "Noordermarkt", "Bloemgracht", "Javastraat", "Van der Pekstraat", "Zeedijk",
  "Linnaeusstraat", "Spuistraat", "Prinsengracht", "Herengracht",
  "Brouwersgracht", "Haarlemmerstraat", "Leliegracht", "Keizersgracht",
  "Bloemstraat", "Tuinstraat", "Derde Egelantiersdwarsstraat", "Dapperstraat",
  "Plantage Muidergracht", "Beethovenstraat", "Adelaarsweg", "Sint Olofspoort",
  "Jan van Galenstraat", "Pijlsteeg", "Kolksteeg", "Binnenkant",
  "Spreeuwenpark", "Stopera", "NDSM-werf", "Anton de Komplein", "Westerkerk",
  "Meester Visserplein", "Jonas Daniël Meijerplein", "Portugees-Israëlietische Synagoge",
  "Joods Historisch Museum", "Dappermarkt", "OBA Oosterdok", "Museumplein",
  "Rijksmuseum", "Stedelijk Museum", "Van Goghmuseum", "Concertgebouw",
  "Paradiso", "Leidseplein", "Waterlooplein", "Spui", "Albert Cuypmarkt",
  "Artis", "Het Stenen Hoofd", "Vrankrijk", "Paleis op de Dam",
  "Amsterdam Centraal", "Station Bijlmer Arena", "Filmtheater Kriterion",
  "Roeterseilandcampus", "P.C. Hoofthuis", "Magna Plaza", "Hortus Botanicus",
  "Hendrik Jonkerplein", "De Marktkantine", "Brouwerij Oedipus",
  "Wynand Fockink", "Proeflokaal de Ooievaar", "Café 't Papeneiland",
  "Café Chris", "Café Winkel 43", "Sameplace", "Krakerscafé Molli",
  "Café De Hoppe", "Café De Zwart", "In de Wildeman", "Speeltuin van Sloten",
  "Voetbalclub O.S.V.", "Van der Pekmarkt", "Tuinen van West", "Plein '40-'45",
  "IJplein", "Gedempt Hamerkanaal", "Anand Joti", "Lau Mazirelbrug",
  "Noorderkerk", "Amstel", "IJ", "Sloterplas", "Java-eiland",
];

interface PDOKDoc {
  weergavenaam: string;
  type: string;
  centroide_ll: string; 
}

interface PDOKResponse {
  response: {
    docs: PDOKDoc[];
  };
}

async function getLocation(placeName: string): Promise<string | null> {
  const params = new URLSearchParams({
    q: placeName,
    fq: "gemeentenaam:amsterdam",
    rows: "1",
    fl: "weergavenaam,centroide_ll,type",
  });

  const res = await fetch(
    `https://api.pdok.nl/bzk/locatieserver/search/v3_1/free?${params}`
  );
  const data: PDOKResponse = await res.json();
  const doc = data.response.docs[0];
  if (!doc?.centroide_ll) {
    console.log('location not found', doc)
    return null;
  }

  return doc.centroide_ll
}

async function extractGeomWktFromText(text: string): Promise<string[]> {
  const foundInText = places.filter(place =>
    text.toLowerCase().includes(place.toLowerCase())
  );
  const geomWkts: Record<string, string> = {}

  for (let foundPlace of foundInText) {
    if (!(foundPlace in placesGeomLookup)) {
      const point: string | null = await getLocation(foundPlace) 

      if (point == null) {
        console.log('Location not found for ' + foundPlace)
      } else {
        console.log('Location found for', foundPlace)
      }

      placesGeomLookup[foundPlace] = point!
      geomWkts[foundPlace] = point!
    }
  }
  
  return Object.values(geomWkts)
}