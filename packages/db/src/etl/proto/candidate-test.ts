/**
 * Standalone probe for the source-agnostic feature→place candidate approach.
 * Runs hardcoded queries against the live DB and prints the candidate pool + the
 * single place it resolves to. Nothing is written. For discussing the ranking
 * approach — not part of the ingest pipeline.
 *
 *   bun --env-file=../../.env src/etl/proto/candidate-test.ts   (from packages/db)
 *
 * The fetchers, types, consts, and selection helpers are imported from
 * `candidate-fetchers.ts` (single source of truth); this file is only the harness.
 *
 * Two modes, each with its own hardcoded query:
 *   POINT — a feature geocoded to a coordinate; links the finest place within cap.
 *   NAME  — a feature given a place name; the match reveals the type, links the winner.
 *
 * Dating: features carry a RANGE [start, end] (the app's model). All temporal tests
 * are OVERLAP, matching the co-dev's inferByName and the heatmap binning. A single-day
 * feature is just start == end.
 *
 * (connects with the same DB_* env as db:ingest)
 */
import {
  type PlaceType,
  type Candidate,
  GRANULARITIES,
  MAX_DISTANCE_M,
  getCandidatesByPoint,
  getCandidatesByName,
  rank,
  finestResolvable,
  resolveNamePool,
} from '../places/place-candidates';

// ── hardcoded queries: edit to probe a different feature (single day = start == end) ──
const QUERY_WKT = 'POINT(4.883590842663041 52.377959515923116)'; // WGS84 lon lat — Jordaan
const QUERY_START = '1920-01-01';
const QUERY_END = '1920-01-01';
const QUERY_TYPE: PlaceType | null = null;      // declare the point feature's granularity, or null

const QUERY_NAME = 'Beursplein';                // exact place name (unambiguous — resolves to one place)
const QUERY_NAME_START = '1910-01-01';
const QUERY_NAME_END = '1910-01-01';
const QUERY_NAME_TYPE: PlaceType | null = null; // restrict the name match to this type, or null

// Days per year, for reporting a temporal gap / overlap in years.
const DAYS_PER_YEAR = 365;

// One feature's outcome. In the real ingest this is what the loop tallies: a
// skipped feature (asserted type unresolved) warns + increments a counter shown
// in the final summary — it never aborts the run.
interface Outcome { feature: string; skipped: string | null; }

function printPointBlock(pool: Candidate[], type: PlaceType): Candidate | undefined {
  const cap = MAX_DISTANCE_M[type];
  const inType = pool.filter((c) => c.type === type && (cap === null || c.distanceM <= cap)).sort(rank);
  console.log(`── ${type} ${cap === null ? '(containment)' : `(≤${cap}m)`} ──`);
  if (inType.length === 0) {
    console.log('   (no candidate within cap — not linked)\n');
    return undefined;
  }
  inType.forEach((c, i) => {
    const metric = c.overlapDays != null
      ? `ovl ${(c.overlapDays / DAYS_PER_YEAR).toFixed(1)}y`
      : (c.distanceM === 0 ? 'contains' : `${c.distanceM.toFixed(1)}m`);
    console.log(`   ${i === 0 ? '✓' : ' '} ${c.source.padEnd(8)} ${metric.padEnd(11)} ${c.eraFit ? 'era✓' : 'era✗'}  ${c.name ?? '(no name)'}`);
    console.log(`       ${c.placeId}`);
  });
  console.log('');
  return inType[0];
}

async function runPoint(): Promise<Outcome> {
  const feature = `POINT ${QUERY_WKT} @ [${QUERY_START} .. ${QUERY_END}]`;
  console.log('\n════════ POINT MODE ════════');
  console.log(`Query point : ${QUERY_WKT}`);
  console.log(`Feature date: ${QUERY_START} .. ${QUERY_END}`);
  console.log(`Feature type: ${QUERY_TYPE ?? '(unspecified → finest resolvable)'}\n`);

  const pool = await getCandidatesByPoint(QUERY_WKT, QUERY_START, QUERY_END);
  const best: Partial<Record<PlaceType, Candidate>> = {};
  for (const type of GRANULARITIES) best[type] = printPointBlock(pool, type);

  const primaryType = QUERY_TYPE ?? finestResolvable(best);

  // A specified type is an ASSERTION: if it doesn't resolve we do NOT fall back to
  // another type — the feature is SKIPPED (warned + tallied), the run continues.
  if (QUERY_TYPE && !best[QUERY_TYPE]) {
    console.log(`Feature granularity: ${QUERY_TYPE} (specified)\n`);
    console.log(`⚠  skipped — asserted ${QUERY_TYPE} did not resolve (no fallback to a different type).`);
    return { feature, skipped: `asserted ${QUERY_TYPE} not found in DB` };
  }
  if (!primaryType) {
    console.log('Feature granularity: —\n');
    console.log('⚠  skipped — no place resolved for this point.');
    return { feature, skipped: 'no place resolved' };
  }

  console.log(`Feature granularity: ${primaryType} ${QUERY_TYPE ? '(specified)' : '(auto: finest resolvable)'}\n`);

  const link = best[primaryType]!;
  console.log('Resolved link (single, most specific):');
  console.log(`   ${primaryType.padEnd(14)} ${link.source} — ${link.name} (${link.placeId})`);
  return { feature, skipped: null };
}

async function runName(): Promise<Outcome> {
  const feature = `NAME "${QUERY_NAME}" @ [${QUERY_NAME_START} .. ${QUERY_NAME_END}]`;
  console.log('\n════════ NAME MODE ════════');
  console.log(`Query name  : ${QUERY_NAME}`);
  console.log(`Feature date: ${QUERY_NAME_START} .. ${QUERY_NAME_END}`);
  console.log(`Feature type: ${QUERY_NAME_TYPE ?? '(unspecified → whatever the name matches)'}\n`);

  let cands = await getCandidatesByName(QUERY_NAME, QUERY_NAME_START, QUERY_NAME_END);
  if (QUERY_NAME_TYPE) cands = cands.filter((c) => c.type === QUERY_NAME_TYPE);

  const resolution = resolveNamePool(cands);

  // A specified type is an ASSERTION: no fallback to a different type. Empty pool or an
  // ambiguous top (two equal-gap same-type matches) both SKIP (warned + tallied); run continues.
  if (resolution.kind === 'none') {
    console.log(QUERY_NAME_TYPE
      ? `⚠  skipped — asserted ${QUERY_NAME_TYPE} did not match the name "${QUERY_NAME}" (no fallback to a different type).`
      : `⚠  skipped — no place matched the name "${QUERY_NAME}".`);
    return { feature, skipped: QUERY_NAME_TYPE ? `asserted ${QUERY_NAME_TYPE} not found for name` : 'name not found in DB' };
  }
  if (resolution.kind === 'ambiguous') {
    console.log(`⚠  skipped — ambiguous: ${resolution.tied.length} ${resolution.tied[0].type} matches for "${QUERY_NAME}" with equal temporal gap (no way to choose).`);
    return { feature, skipped: `ambiguous name "${QUERY_NAME}" (${resolution.tied[0].type}, equal gap)` };
  }

  // nearest observation first; ties broken by the address>street>… priority (for display)
  cands.sort((a, b) => a.gapDays - b.gapDays || GRANULARITIES.indexOf(a.type) - GRANULARITIES.indexOf(b.type));

  console.log('Name candidates (nearest-in-time observation wins):');
  cands.forEach((c, i) => {
    console.log(`   ${i === 0 ? '✓' : ' '} ${c.type.padEnd(13)} ${c.source.padEnd(8)} via ${c.via.padEnd(10)} gap ${(c.gapDays / DAYS_PER_YEAR).toFixed(1)}y  ${c.name ?? '(no name)'}`);
    console.log(`       ${c.placeId}`);
  });

  const winner = resolution.winner;
  console.log('\nResolved link (single, most specific):');
  console.log(`   ${winner.type.padEnd(14)} ${winner.source} — ${winner.name} (${winner.placeId})`);
  return { feature, skipped: null };
}

async function main() {
  // In the real ingest this loops over every feature; here it's the sample queries.
  // Skipped features are tallied and reported, they don't stop the run.
  const outcomes: Outcome[] = [
    await runPoint(),
    await runName(),
  ];

  const skipped = outcomes.filter((o) => o.skipped);
  console.log('\n════════ RUN SUMMARY ════════');
  console.log(`features processed: ${outcomes.length}   linked: ${outcomes.length - skipped.length}   skipped: ${skipped.length}`);
  for (const s of skipped) console.log(`   ⚠  ${s.feature} — ${s.skipped}`);
  console.log('');
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
