/**
 * Probe: run the NAME resolver against a real no-coordinate dataset (street-feature
 * diaries — schema.org articles with running Dutch text + a publication year).
 *
 *   bun --env-file=../../.env src/etl/proto/diaries-test.ts   (from packages/db)
 *
 * Pipeline mirrors the co-dev's TEXT path for extraction, then MY resolver:
 *   articleBody → PlaceTrie.match (known place-names found as word-sequences)
 *              → getCandidatesByName + resolveNamePool (per toponym, dated)
 *
 * The trie is built from street/neighbourhood/district names only (addresses carry
 * house numbers and don't appear in prose). Extraction precision is the trie's /
 * classifier's job — this probe reports how noisy it is and how the resolver copes.
 */
import { readFileSync } from 'fs';
import { db } from '../../client';
import { sql } from 'drizzle-orm/sql';
import { PlaceTrie } from '../places/place-trie';
import { getCandidatesByName, resolveNamePool, type NameResolution } from '../places/place-candidates';

const FILE = '/home/m/Documents/projects/2026/atm-postgis-integration/data/diaries_sample.json';

type Diary = { headline?: string; articleBody?: string; datePublished?: string; identifier?: string };

// Non-address place names (current + historical) for the extraction trie.
async function placeNameMap(): Promise<Map<string, string>> {
  const r = await db.execute<{ name: string; type: string }>(sql`
    SELECT LOWER(p.name) AS name, p.type AS type
    FROM place p WHERE p.name IS NOT NULL AND p.type <> 'address'
    UNION
    SELECT LOWER(pn.name) AS name, p.type AS type
    FROM place_historical_name pn JOIN place p ON p.id = pn.place_id
    WHERE pn.name IS NOT NULL AND p.type <> 'address'
  `);
  const m = new Map<string, string>();
  for (const row of r.rows) if (row.name) m.set(row.name, row.type);
  return m;
}

const yearRange = (d?: string): [string, string] => {
  const y = (String(d ?? '').match(/\d{4}/)?.[0]) ?? '2019';
  return [`${y}-01-01`, `${y}-12-31`];
};

async function main() {
  const diaries: Diary[] = JSON.parse(readFileSync(FILE, 'utf8'));
  console.log(`Loaded ${diaries.length} diaries. Building extraction trie…`);
  const nameMap = await placeNameMap();
  const trie = new PlaceTrie(nameMap);
  console.log(`Trie built from ${nameMap.size} non-address place names.\n`);

  const cache = new Map<string, NameResolution>();
  const resolve = async (name: string, s: string, e: string): Promise<NameResolution> => {
    const key = `${name}|${s}|${e}`;
    if (!cache.has(key)) cache.set(key, resolveNamePool(await getCandidatesByName(name, s, e)));
    return cache.get(key)!;
  };

  let occ = 0, resolved = 0, ambiguous = 0, none = 0;
  let realOcc = 0, realResolved = 0, realAmbiguous = 0, realNone = 0;
  const byType: Record<string, number> = {};
  const bySource: Record<string, number> = {};
  const ambiguousNames = new Map<string, number>();
  const noneNames = new Map<string, number>();
  const shortNames = new Map<string, number>();
  const samples: string[] = [];

  for (let i = 0; i < diaries.length; i++) {
    const art = diaries[i];
    const [start, end] = yearRange(art.datePublished);
    const names = [...new Set(trie.match(String(art.articleBody ?? '')).map((m) => m.value!))];

    const lines: string[] = [];
    for (const name of names) {
      const r = await resolve(name, start, end);
      occ++;
      const short = name.length <= 2;
      if (short) shortNames.set(name, (shortNames.get(name) ?? 0) + 1);
      else realOcc++;
      if (r.kind === 'resolved') {
        resolved++;
        if (!short) { realResolved++; byType[r.winner.type] = (byType[r.winner.type] ?? 0) + 1; bySource[r.winner.source] = (bySource[r.winner.source] ?? 0) + 1; }
        lines.push(`   ${short ? '·' : '✓'} ${name}  →  ${r.winner.type}/${r.winner.source} — ${r.winner.name} (gap ${(r.winner.gapDays / 365).toFixed(0)}y)${short ? '   [≤2 char — noise]' : ''}`);
      } else if (r.kind === 'ambiguous') {
        ambiguous++;
        if (!short) realAmbiguous++;
        ambiguousNames.set(name, (ambiguousNames.get(name) ?? 0) + 1);
        lines.push(`   ? ${name}  →  AMBIGUOUS (${r.tied.length} ${r.tied[0].type} matches)`);
      } else {
        none++;
        if (!short) realNone++;
        noneNames.set(name, (noneNames.get(name) ?? 0) + 1);
        lines.push(`   · ${name}  →  no place`);
      }
    }

    if (i < 6) {
      samples.push(`\n[${i}] "${art.headline ?? art.identifier}"  (${art.datePublished}) — ${names.length} toponyms`);
      samples.push(...lines);
    }
  }

  const top = (m: Map<string, number>, n = 10) =>
    [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => `${k}×${v}`).join(', ');

  console.log('════════ SAMPLE ARTICLES ════════');
  console.log(samples.join('\n'));

  console.log('\n════════ AGGREGATE ════════');
  console.log(`Toponym occurrences (deduped per article): ${occ}   [resolved ${resolved} · ambiguous ${ambiguous} · none ${none}]`);
  console.log(`unique resolver calls (cache size): ${cache.size}`);
  console.log(`\n── excluding ≤2-char matches (function-word ↔ buurt-code collisions) ──`);
  console.log(`Real toponym occurrences: ${realOcc}`);
  console.log(`  resolved:  ${realResolved}  (${((realResolved / realOcc) * 100).toFixed(0)}%)`);
  console.log(`  ambiguous: ${realAmbiguous}  (${((realAmbiguous / realOcc) * 100).toFixed(0)}%)`);
  console.log(`  no place:  ${realNone}  (${((realNone / realOcc) * 100).toFixed(0)}%)`);
  console.log(`resolved by type:   ${JSON.stringify(byType)}`);
  console.log(`resolved by source: ${JSON.stringify(bySource)}`);
  console.log(`\ntop ambiguous names: ${top(ambiguousNames)}`);
  console.log(`≤2-char noise matches: ${top(shortNames)}`);
  console.log('');
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
