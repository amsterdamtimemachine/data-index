/**
 * Import street data from Adamlink straten TTL
 *
 * Parses the RDF file containing Amsterdam streets with LineString geometry
 * and historical name variants. Creates one place row per street (current
 * geometry) and place_name entries for dated name variants.
 *
 * Streets without geometry are skipped (693 out of 7,268).
 * For the 34 streets with multiple geometry versions, the current version
 * (no begin/end timestamps) is used.
 *
 * Usage: bun run db:ingest -s streets -f <path-to-adamlinkstraten.ttl>
 */
import { readFileSync } from 'fs';
import { Parser } from 'n3';
import { sql } from 'drizzle-orm';
import { db } from '../../client';
import { placeName } from '../../schema';

const BATCH_SIZE = 100;

interface StreetName {
  label: string;
  since: string | null;
  until: string | null;
}

interface Street {
  uri: string;
  prefLabel: string;
  wkt: string;
  names: StreetName[];
}

export async function ingest(filePath: string) {
  console.log(`Parsing ${filePath}...`);

  const ttl = readFileSync(filePath, 'utf8');
  const parser = new Parser();
  const quads = parser.parse(ttl);

  const subjects = new Map<string, { predicate: string; object: string }[]>();
  for (const q of quads) {
    if (!subjects.has(q.subject.value)) subjects.set(q.subject.value, []);
    subjects.get(q.subject.value)!.push({ predicate: q.predicate.value, object: q.object.value });
  }

  const streets: Street[] = [];
  let skippedNoGeom = 0;
  let multiGeom = 0;

  const streetUris = [...subjects.keys()].filter(k => k.includes('/geo/street/'));

  for (const uri of streetUris) {
    const preds = subjects.get(uri)!;

    const prefLabel = preds.find(p => p.predicate.endsWith('prefLabel'))?.object;
    if (!prefLabel) continue;

    // Resolve geometry: pick the current version (no begin/end timestamps on the geom node)
    const geomNodes = preds.filter(p => p.predicate.endsWith('hasGeometry'));
    if (geomNodes.length === 0) {
      skippedNoGeom++;
      continue;
    }

    if (geomNodes.length > 1) multiGeom++;

    let wkt: string | null = null;
    for (const gn of geomNodes) {
      const gnPreds = subjects.get(gn.object) || [];
      const hasBegin = gnPreds.some(p => p.predicate.includes('EarliestBegin'));
      const hasEnd = gnPreds.some(p => p.predicate.includes('EarliestEnd'));
      const nodeWkt = gnPreds.find(p => p.predicate.endsWith('asWKT'))?.object;

      if (!hasBegin && !hasEnd && nodeWkt) {
        wkt = nodeWkt;
        break;
      }
    }

    // Fallback: if no undated geometry, pick the one without an end date (still active)
    if (!wkt) {
      for (const gn of geomNodes) {
        const gnPreds = subjects.get(gn.object) || [];
        const hasEnd = gnPreds.some(p => p.predicate.includes('EarliestEnd'));
        const nodeWkt = gnPreds.find(p => p.predicate.endsWith('asWKT'))?.object;
        if (!hasEnd && nodeWkt) {
          wkt = nodeWkt;
          break;
        }
      }
    }

    // Last resort: take the first geometry
    if (!wkt) {
      const firstGeom = subjects.get(geomNodes[0].object) || [];
      wkt = firstGeom.find(p => p.predicate.endsWith('asWKT'))?.object || null;
    }

    if (!wkt) {
      skippedNoGeom++;
      continue;
    }

    // Collect dated name variants from schema:name blank nodes
    const names: StreetName[] = [];
    const nameNodes = preds.filter(p => p.predicate.endsWith('/name'));
    for (const nn of nameNodes) {
      const nnPreds = subjects.get(nn.object) || [];
      const label = nnPreds.find(p => p.predicate.endsWith('label'))?.object;
      if (!label) continue;

      const since = nnPreds.find(p => p.predicate.includes('EarliestBegin'))?.object || null;
      const until = nnPreds.find(p => p.predicate.includes('EarliestEnd'))?.object || null;

      if (since || until) {
        names.push({ label, since, until });
      }
    }

    streets.push({ uri, prefLabel, wkt, names });
  }

  const datedNames = streets.reduce((sum, s) => sum + s.names.length, 0);
  console.log(`Resolved ${streets.length} streets with geometry (${skippedNoGeom} skipped without geometry, ${multiGeom} with multiple geometry versions)`);
  console.log(`Found ${datedNames} dated name variants across ${streets.filter(s => s.names.length > 0).length} streets`);

  // Insert place rows
  let placeCount = 0;
  for (const s of streets) {
    await db.execute(sql`
      INSERT INTO place (id, type, preferred_label, geometry)
      VALUES (
        ${s.uri},
        'street',
        ${s.prefLabel},
        ST_Transform(ST_GeomFromText(${s.wkt}, 4326), 28992)
      )
      ON CONFLICT (id) DO NOTHING
    `);
    placeCount++;
    if (placeCount % 500 === 0) {
      process.stdout.write(`\r  ${placeCount} / ${streets.length} places`);
    }
  }
  console.log(`\n  ${placeCount} street places created`);

  // Insert place_name entries for dated name variants
  let nameCount = 0;
  let nameBatch: { id: string; placeId: string; name: string; since: string | null; until: string | null; source: string }[] = [];

  async function flushNames() {
    if (nameBatch.length === 0) return;
    await db.insert(placeName).values(nameBatch).onConflictDoNothing();
    nameBatch = [];
  }

  for (const s of streets) {
    for (let i = 0; i < s.names.length; i++) {
      const n = s.names[i];
      nameBatch.push({
        id: `${s.uri}#name-${i}`,
        placeId: s.uri,
        name: n.label,
        since: n.since ? `${n.since}-01-01` : null,
        until: n.until ? `${n.until}-01-01` : null,
        source: 'adamlink-straten',
      });
      nameCount++;

      if (nameBatch.length >= BATCH_SIZE) {
        await flushNames();
      }
    }
  }
  await flushNames();

  console.log(`  ${nameCount} place_name entries created`);
  console.log(`\nDone: ${placeCount} streets, ${nameCount} name variants`);
}
