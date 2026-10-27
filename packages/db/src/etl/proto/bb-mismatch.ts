import { createReadStream } from 'fs';
import { parse } from 'csv-parse';
import { db } from '../../client';
import { sql } from 'drizzle-orm/sql';
import { inferByAdamURI } from '../places/place-inference';

const FILE = '/home/m/Documents/projects/2026/atm-postgis-integration/data/beeldbank.csv';

async function main() {
  const p = createReadStream(FILE).pipe(parse({ columns: true }));
  let rows = 0, shown = 0;
  for await (const row of p) {
    if (rows++ >= 500 || shown >= 4) break;
    let newId: string | undefined, via = '';
    for (const col of ['address', 'street']) {
      const uri = String(row[col] || '').trim(); if (!uri) continue;
      const r = await inferByAdamURI(uri); if ('placeId' in r) { newId = r.placeId; via = col; break; }
    }
    const dbUrl = `https://id.archief.amsterdam/${String(row.resource || '').split('/').pop()}`;
    const links = await db.execute<{ place_id: string }>(sql`
      SELECT p.id AS place_id FROM features f JOIN feature_to_place fp ON fp.feature_id=f.id JOIN place p ON p.id=fp.place_id
      WHERE f.dataset_id='beeldbank' AND f.url=${dbUrl}`);
    if (links.rows.length === 0) continue;
    const dbSet = links.rows.map((r) => r.place_id);
    if (newId && !dbSet.includes(newId)) {
      shown++;
      const exists = await db.execute<{ t: string }>(sql`SELECT type AS t FROM place WHERE id=${newId}`);
      console.log(`URI(${via}) = …${String(row[via] || '').slice(-42)}`);
      console.log(`  new →   ${newId}  (exists as ${exists.rows[0]?.t ?? 'MISSING'})`);
      console.log(`  DB has: ${dbSet.join(', ') || '(none)'}\n`);
    }
  }
  if (!shown) console.log('no mismatches in the first 500 rows');
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
