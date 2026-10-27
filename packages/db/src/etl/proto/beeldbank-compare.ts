/**
 * Phase 5 probe: beeldbank (URI path) — confirm URI resolution is unchanged AND that
 * UNDATED URI features still resolve (URI is exempt from the undated guard, spec §5).
 * READ-ONLY. Runs the new inferByAdamURI cascade (address → street) per row and checks
 * the result against the feature's actual DB links.
 *
 *   bun --env-file=../../.env src/etl/proto/beeldbank-compare.ts   (from packages/db)
 */
import { createReadStream } from 'fs';
import { parse } from 'csv-parse';
import { db } from '../../client';
import { sql } from 'drizzle-orm/sql';
import { inferByAdamURI } from '../places/place-inference';

const FILE = '/home/m/Documents/projects/2026/atm-postgis-integration/data/beeldbank.csv';
const LIMIT = 500;

async function main() {
  const parser = createReadStream(FILE).pipe(parse({ columns: true }));
  let rows = 0, undated = 0, undatedResolved = 0;
  let resolved = 0, skipped = 0, notInDb = 0, matchesDb = 0, dbHasLink = 0;

  for await (const row of parser) {
    if (rows >= LIMIT) break;
    rows++;
    const isUndated = !String(row.startDate || '').trim();
    if (isUndated) undated++;

    // new URI cascade: address then street
    let newId: string | undefined;
    for (const col of ['address', 'street']) {
      const uri = String(row[col] || '').trim();
      if (!uri) continue;
      const res = await inferByAdamURI(uri);
      if ('placeId' in res) { newId = res.placeId; break; }
    }
    if (newId) { resolved++; if (isUndated) undatedResolved++; } else { skipped++; }

    // cross-check against the feature's actual DB links (feature can have several)
    const dbUrl = `https://id.archief.amsterdam/${String(row.resource || '').split('/').pop()}`;
    const links = await db.execute<{ place_id: string }>(sql`
      SELECT p.id AS place_id FROM features f
      JOIN feature_to_place fp ON fp.feature_id = f.id
      JOIN place p ON p.id = fp.place_id
      WHERE f.dataset_id = 'beeldbank' AND f.url = ${dbUrl}`);
    if (links.rows.length === 0) { notInDb++; continue; }
    dbHasLink++;
    if (newId && links.rows.some((r) => r.place_id === newId)) matchesDb++;
  }

  console.log(`\nBeeldbank sample: ${rows} rows  (${undated} undated)\n`);
  console.log('new URI cascade (address → street):');
  console.log(`  resolved: ${resolved}  (${((resolved / rows) * 100).toFixed(0)}%)`);
  console.log(`  skipped:  ${skipped}`);
  console.log(`  ↳ UNDATED rows resolved: ${undatedResolved} / ${undated}  ${undatedResolved === undated ? 'PASS — URI exempt from undated guard' : 'CHECK'}`);
  console.log(`\nconsistency with DB links:`);
  console.log(`  rows whose feature is in the DB: ${dbHasLink}  (not-in-DB: ${notInDb})`);
  console.log(`  new result ∈ feature's DB links: ${matchesDb} / ${dbHasLink}  ${matchesDb === dbHasLink ? 'PASS — URI resolution unchanged' : 'CHECK'}`);
  console.log('');
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
