/**
 * Import Delpher newspaper articles
 *
 * Parses CSV of newspaper articles with geometry points.
 * Matches geometry to existing places via nearest-neighbor spatial lookup.
 * Unmatched features (no place within threshold) are skipped.
 *
 * Usage: bun run db:ingest -s delpher -f ../../data/delpher_newspapers.csv
 */
import { createReadStream } from 'fs';
import { parse } from 'csv-parse';
import { sql } from 'drizzle-orm';
import { db } from '../../client';
import { organisations, datasets, relation, features, featureToPlace } from '../../schema';
import type { CreativeWorkEntity } from '@atm/shared';
import { formatDateRange } from '../utils';

const SOURCE_ID = 'delpher';
const BATCH_SIZE = 1000;

/**
 * Maximum distance in meters to match a delpher geometry to an existing place.
 * Based on dry run: 99.8% of delpher points match within 5m.
 */
const MATCH_THRESHOLD_METERS = 5;

interface RawRow {
  id: string;
  url: string;
  title: string;
  text: string;
  period: string;      // PostgreSQL range: "[1974-10-25,1974-10-26)"
  geom_wkt: string;    // "POINT(4.901959 52.376688)" WGS84
  dataset: string;
  tags: string;
}

type PlaceMatch = { place_id: string };

/**
 * Parse PostgreSQL range format "[1974-10-25,1974-10-26)" to start/end dates
 */
function parsePeriod(period: string): { startDate: string | null; endDate: string | null } {
  // Format: [start,end) — inclusive start, exclusive end
  const match = period.match(/[\[(\s]*(\d{4}-\d{2}-\d{2})\s*,\s*(\d{4}-\d{2}-\d{2})\s*[)\]]/);
  if (!match) return { startDate: null, endDate: null };
  return { startDate: match[1], endDate: match[2] };
}

export async function ingest(filePath: string) {
  await db.insert(organisations)
    .values({ id: 'kb', label: 'Koninklijke Bibliotheek', url: 'https://www.kb.nl' })
    .onConflictDoNothing();

  await db.insert(datasets)
    .values({ id: SOURCE_ID, label: 'Delpher Kranten', url: 'https://www.delpher.nl', organisationId: 'kb' })
    .onConflictDoNothing();

  await db.insert(relation)
    .values({ id: 'isAbout', label: 'Is About' })
    .onConflictDoNothing();

  console.log(`Streaming ${filePath}...`);
  console.log(`Match threshold: ${MATCH_THRESHOLD_METERS}m`);

  // Cache: WKT → place ID (or null for no match)
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

  const csvParser = createReadStream(filePath).pipe(
    parse({ columns: true, relax_column_count: true, relax_quotes: true })
  );

  let featureCount = 0;
  let linkCount = 0;
  let skipped = 0;

  let featureBatch: any[] = [];
  let linkBatch: { featureId: string; placeId: string; relationId: string }[] = [];

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

  for await (const row of csvParser as AsyncIterable<RawRow>) {
    if (!row.geom_wkt || !row.url) continue;

    const placeId = await resolvePlaceId(row.geom_wkt);
    if (!placeId) {
      skipped++;
      continue;
    }

    const { startDate, endDate } = parsePeriod(row.period);
    const dateCreated = formatDateRange(startDate, endDate);

    const entity: CreativeWorkEntity = {
      type: 'CreativeWork',
      label: row.title || '',
      url: row.url,
      ...(dateCreated && { dateCreated })
    };

    const featureId = crypto.randomUUID();

    featureBatch.push({
      id: featureId,
      url: row.url,
      recordType: 'text',
      label: row.title || '',
      description: row.text || null,
      contentUrl: row.url,
      startDate,
      endDate,
      datasetId: SOURCE_ID,
      entity
    });

    linkBatch.push({ featureId, placeId, relationId: 'isAbout' });
    featureCount++;
    linkCount++;

    if (featureBatch.length >= BATCH_SIZE) {
      await flush();
    }

    if ((featureCount + skipped) % 1000 === 0) {
      process.stdout.write(`\r  ${featureCount} ingested, ${skipped} skipped, ${placeCache.size} unique geometries cached`);
    }
  }

  await flush();

  console.log(`\nDone: ${featureCount} features, ${linkCount} links, ${skipped} skipped (no place within ${MATCH_THRESHOLD_METERS}m)`);
}
