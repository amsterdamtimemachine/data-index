/**
 * cell_features must return exactly what the old live query returned.
 *
 * getHeatmapTimeline and getHistogram used to join place_cells -> feature_to_place ->
 * features -> place against a generated slices table and COUNT(DISTINCT feature_id)
 * on every request. They now read precomputed buckets and union roaring bitmaps
 * instead. That is only a safe swap if the counts are identical, so this file keeps
 * the old SQL as the oracle and diffs the two, cell by cell.
 *
 * Both mistakes this caught while it was being written were silent — wrong numbers,
 * no error:
 *   - a bucket window that dropped the last display bin's later base bins
 *   - aliasing the display bin `time_bin`, which GROUP BY resolved to cell_features'
 *     real time_bin column (the base bin), so it grouped by decade instead
 * Neither is visible by eyeballing a heatmap. Keep the oracle until the old path is
 * deleted, and keep the matrix wide — the bugs were resolution/bin-size specific.
 */
import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { sql } from 'drizzle-orm';
import { setupTestDb, cleanTestDb, teardownTestDb, seedTestData, db } from './setup';
import { rebuildIndex } from '../etl/post-process/rebuild-index';
import { getHeatmapTimeline } from '../queries/heatmap';
import { getHistogram } from '../queries/histogram';
import { getGridConfig } from '../queries/grid-config';
import { computeTimeSlices } from '../queries/time-slices';
import type { PlaceType, RecordType } from '@atm/shared';

type OldRow = { grid_col: number; grid_row: number; time_bin: string; count: string };

/** The pre-cell_features heatmap query, verbatim in shape. The oracle. */
async function liveHeatmap(
  cols: number,
  binSize: number,
  recordTypes: RecordType[],
  placeTypes?: PlaceType[]
): Promise<Map<string, number>> {
  const cfg = await getGridConfig();
  const maxX = cfg.maxCellX, maxY = cfg.maxCellY;
  const gridCols = Math.min(cols, maxX + 1);
  const gridRows = Math.min(Math.max(1, Math.round((gridCols * (maxY + 1)) / (maxX + 1))), maxY + 1);
  const slices = await computeTimeSlices(binSize);
  const first = slices[0], last = slices[slices.length - 1];

  const placeFilter = placeTypes?.length ? sql`AND p.type IN ${placeTypes}` : sql``;

  const res = await db.execute<OldRow>(sql`
    WITH slices AS (
      SELECT gs AS bin_start, gs + ${binSize}::int AS bin_end
      FROM generate_series(${first.startYear}::int, ${last.startYear}::int, ${binSize}::int) AS gs
    )
    SELECT LEAST(FLOOR(pc.cell_x::numeric * ${gridCols} / ${maxX + 1})::int, ${gridCols - 1}) as grid_col,
           LEAST(FLOOR(pc.cell_y::numeric * ${gridRows} / ${maxY + 1})::int, ${gridRows - 1}) as grid_row,
           s.bin_start as time_bin,
           COUNT(DISTINCT f.id) as count
    FROM place_cells pc
    JOIN feature_to_place fp ON pc.place_id = fp.place_id
    JOIN features f ON fp.feature_id = f.id
    JOIN place p ON pc.place_id = p.id
    JOIN slices s ON EXTRACT(YEAR FROM f.start_date) < s.bin_end AND EXTRACT(YEAR FROM f.end_date) >= s.bin_start
    WHERE f.record_type IN ${recordTypes}
      ${placeFilter}
    GROUP BY grid_col, grid_row, s.bin_start
  `);

  // key: sliceStart|gridIndex — the same identity getHeatmapTimeline exposes
  const out = new Map<string, number>();
  for (const r of res.rows) {
    const idx = Number(r.grid_row) * gridCols + Number(r.grid_col);
    out.set(`${r.time_bin}|${idx}`, parseInt(r.count));
  }
  return out;
}

/** Flatten getHeatmapTimeline into the same sliceStart|gridIndex -> count shape. */
async function rollupHeatmap(
  cols: number,
  binSize: number,
  recordTypes: RecordType[],
  placeTypes?: PlaceType[]
): Promise<Map<string, number>> {
  const res = await getHeatmapTimeline({ cols }, recordTypes, undefined, placeTypes, binSize);
  const slices = await computeTimeSlices(binSize);
  const out = new Map<string, number>();
  for (const slice of slices) {
    const hm = res.timeline[slice.key];
    if (!hm) continue;
    hm.indices.forEach((idx, i) => {
      if (hm.counts[i] > 0) out.set(`${slice.startYear}|${idx}`, hm.counts[i]);
    });
  }
  return out;
}

function diff(oracle: Map<string, number>, actual: Map<string, number>): string[] {
  const problems: string[] = [];
  for (const key of new Set([...oracle.keys(), ...actual.keys()])) {
    const o = oracle.get(key) ?? 0;
    const a = actual.get(key) ?? 0;
    if (o !== a) problems.push(`${key}: live=${o} rollup=${a}`);
  }
  return problems;
}

describe('cell_features ↔ live query equivalence', () => {
  beforeAll(async () => {
    await setupTestDb();
    await cleanTestDb();
    await seedTestData();
    await rebuildIndex();
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  // Spatial resolution is unrestricted by design (the PM's requirement): base cells
  // fold into any display grid via bitmap union. 7 and 13 are deliberately not round.
  test.each([4, 7, 13, 40])('heatmap matches the live query at grid width %i', async (cols) => {
    const types: RecordType[] = ['image'];
    expect(diff(
      await liveHeatmap(cols, 50, types),
      await rollupHeatmap(cols, 50, types)
    )).toEqual([]);
  });

  // Temporal resolution is quantised: a display bin must be a whole number of base
  // bins, which normaliseBinSize enforces. These are the sizes the UI can produce.
  test.each([10, 50, 100])('heatmap matches the live query at bin size %i', async (binSize) => {
    const types: RecordType[] = ['image'];
    expect(diff(
      await liveHeatmap(8, binSize, types),
      await rollupHeatmap(8, binSize, types)
    )).toEqual([]);
  });

  // place_type is the axis a naive count-sum gets wrong: a feature linked to both an
  // address and a street would be counted twice. Union dedupes it.
  test.each([
    [['address'] as PlaceType[]],
    [['street'] as PlaceType[]],
    [['address', 'street'] as PlaceType[]]
  ])('heatmap matches the live query for place types %o', async (placeTypes) => {
    const types: RecordType[] = ['image'];
    expect(diff(
      await liveHeatmap(8, 50, types, placeTypes),
      await rollupHeatmap(8, 50, types, placeTypes)
    )).toEqual([]);
  });

  test('histogram bin counts match the live query', async () => {
    const types: RecordType[] = ['image'];
    const slices = await computeTimeSlices(50);
    const first = slices[0], last = slices[slices.length - 1];

    const live = await db.execute<{ bin_start: string; count: string }>(sql`
      WITH slices AS (
        SELECT gs AS bin_start, gs + 50::int AS bin_end
        FROM generate_series(${first.startYear}::int, ${last.startYear}::int, 50::int) AS gs
      )
      SELECT s.bin_start::text as bin_start, COUNT(DISTINCT f.id) as count
      FROM features f
      JOIN feature_to_place fp ON fp.feature_id = f.id
      JOIN place_cells pc ON pc.place_id = fp.place_id
      JOIN slices s ON EXTRACT(YEAR FROM f.start_date) < s.bin_end AND EXTRACT(YEAR FROM f.end_date) >= s.bin_start
      WHERE f.record_type IN ${types}
      GROUP BY s.bin_start
    `);
    const expected = new Map(live.rows.map(r => [parseInt(r.bin_start), parseInt(r.count)]));

    const hist = await getHistogram(types, undefined, undefined, 50);
    for (const bin of hist.bins) {
      expect(bin.count).toBe(expected.get(bin.timeSlice.startYear) ?? 0);
    }
  });

  // Every feature must land in a cell, or it is invisible to both the heatmap and the
  // histogram now that both read cell_features. buildCellFeatures warns about this;
  // the fixtures must not trip it.
  test('every dated feature has cell coverage', async () => {
    const res = await db.execute<{ uncovered: string }>(sql`
      SELECT COUNT(*) as uncovered FROM features f
      WHERE f.start_date IS NOT NULL AND f.end_date IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM feature_to_place fp
          JOIN place_cells pc ON pc.place_id = fp.place_id
          WHERE fp.feature_id = f.id
        )
    `);
    expect(parseInt(res.rows[0].uncovered)).toBe(0);
  });

  test('rebuilding is idempotent — same buckets, same counts', async () => {
    const before = await rollupHeatmap(8, 50, ['image']);
    await rebuildIndex();
    expect(diff(before, await rollupHeatmap(8, 50, ['image']))).toEqual([]);
  });
});
