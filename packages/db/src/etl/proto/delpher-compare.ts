/**
 * Phase 5 probe: NEW point resolver vs the ACTUAL current DB links for Delpher.
 * READ-ONLY. Maps each sampled CSV row to its DB feature (featureUuid), reads its
 * current feature_to_place link (what the old ingest produced), runs the new resolver
 * on the same coordinate+date, and diffs — i.e. what a re-ingest would actually change.
 *
 *   bun --env-file=../../.env src/etl/proto/delpher-compare.ts   (from packages/db)
 */
import { createReadStream } from 'fs';
import { parse } from 'csv-parse';
import { db } from '../../client';
import { sql } from 'drizzle-orm/sql';
import { getCandidatesByPoint, getNamesForPlaces, pickFinest } from '../places/place-candidates';
import { confirmByText } from '../places/place-confirm';

const FILE = '/home/m/Documents/projects/2026/atm-postgis-integration/data/delpher_newspapers.csv';
const LIMIT = Number(process.env.LIMIT ?? 500);
// take every Nth row, so a sample spreads over the file instead of its head
const STRIDE = Number(process.env.STRIDE ?? 1);

const parsePeriod = (p: string): [string, string] | null => {
  const m = p?.match(/[\[(\s]*(\d{4}-\d{2}-\d{2})\s*,\s*(\d{4}-\d{2}-\d{2})\s*[)\]]/);
  return m ? [m[1], m[2]] : null;
};

async function main() {
  const parser = createReadStream(FILE).pipe(parse({ columns: true }));
  let processed = 0, undated = 0, notInDb = 0, seen = 0;
  const cat = { same: 0, changed: 0, gained: 0, lost: 0, bothNone: 0 };
  const transitions: Record<string, number> = {};
  // the text confirmation on top of the plain pick
  const conf = { confirmedSame: 0, confirmedMoved: 0, examples: [] as string[] };
  // the wide pool against the former one-per-type-and-source pool: must pick the same
  let poolWidthMoved = 0;

  for await (const row of parser) {
    if (processed >= LIMIT) break;
    if (seen++ % STRIDE !== 0) continue;
    const wkt = String(row.geom_wkt || '').trim();
    if (!wkt.startsWith('POINT')) continue;
    const dates = parsePeriod(String(row.period || ''));
    if (!dates) { undated++; continue; }
    const [start, end] = dates;

    const cur = await db.execute<{ exists: number; place_id: string | null; type: string | null; source: string | null }>(sql`
      SELECT 1 AS exists, p.id AS place_id, p.type, p.source
      FROM features f
      LEFT JOIN feature_to_place fp ON fp.feature_id = f.id
      LEFT JOIN place p ON p.id = fp.place_id
      WHERE f.dataset_id = 'delpher' AND f.url = ${String(row.url)} LIMIT 1`);
    if (cur.rows.length === 0) { notInDb++; continue; }
    processed++;

    const oldId = cur.rows[0].place_id ?? undefined;
    const oldTag = oldId ? `${cur.rows[0].type}/${cur.rows[0].source}` : '∅';

    const pool = await getCandidatesByPoint(wkt, start, end);
    const best = pickFinest(pool);
    const newId = best?.placeId;
    const narrow = new Map<string, typeof pool[number]>();
    for (const c of pool) {
      const k = `${c.type}/${c.source}`;
      if (!narrow.has(k) || c.distanceM < narrow.get(k)!.distanceM) narrow.set(k, c);
    }
    if (pickFinest([...narrow.values()])?.placeId !== newId) poolWidthMoved++;
    const newTag = best ? `${best.type}/${best.source}` : '∅';

    const named = pool.filter((c) => c.type === 'address' || c.type === 'street').map((c) => c.placeId);
    const names = await getNamesForPlaces(named);
    const confirmedPool = confirmByText(pool, names, String(row.text ?? ''));
    const confirmedBest = pickFinest(confirmedPool);
    if (confirmedPool.length !== pool.length) {
      if (confirmedBest?.placeId === newId) conf.confirmedSame++;
      else {
        conf.confirmedMoved++;
        if (conf.examples.length < 12) conf.examples.push(`${row.url}\n      ${best?.name} (${best?.type}) → ${confirmedBest?.name} (${confirmedBest?.type})`);
      }
    }

    if (oldId && newId) { oldId === newId ? cat.same++ : cat.changed++; }
    else if (oldId && !newId) cat.lost++;
    else if (!oldId && newId) cat.gained++;
    else cat.bothNone++;

    if (oldTag !== newTag || (oldId && newId && oldId !== newId)) {
      transitions[`${oldTag} → ${newTag}`] = (transitions[`${oldTag} → ${newTag}`] ?? 0) + 1;
    }
  }

  console.log(`\nDelpher sample vs current DB: ${processed} features compared  (skipped: ${undated} undated, ${notInDb} not-in-DB)\n`);
  console.log('current DB link  →  new resolver:');
  console.log(`  same place:   ${cat.same}  (${((cat.same / processed) * 100).toFixed(0)}%)`);
  console.log(`  changed place:${cat.changed}  (${((cat.changed / processed) * 100).toFixed(0)}%)`);
  console.log(`  gained (DB unlinked → new links): ${cat.gained}`);
  console.log(`  lost (DB linked → new skips):     ${cat.lost}`);
  console.log(`  both none:    ${cat.bothNone}`);
  console.log(`\ntype/source transitions (old → new), where they differ:`);
  for (const [k, v] of Object.entries(transitions).sort((a, b) => b[1] - a[1]).slice(0, 12)) console.log(`  ${v.toString().padStart(4)}  ${k}`);
  console.log(`\nwide pool vs former narrow pool: ${poolWidthMoved} different picks`);
  console.log(`\ntext confirmation: narrowed ${conf.confirmedSame + conf.confirmedMoved} pools, same pick ${conf.confirmedSame}, moved ${conf.confirmedMoved}`);
  for (const e of conf.examples) console.log(`  ${e}`);
  console.log('');
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
