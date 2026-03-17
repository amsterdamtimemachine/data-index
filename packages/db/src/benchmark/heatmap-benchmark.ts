import { sql } from 'drizzle-orm';
import { db } from '../client';
import { featureCells, features } from '../schema';
import { TIME_SLICES, GRID_DEFAULT } from '@atm/shared';

// Query result types
type CellCount = { cell_x: number; cell_y: number; count: string };
type CellCountWithTime = { cell_x: number; cell_y: number; time_bin: string; count: string };
type MaxCell = { max_x: number; max_y: number };

const RECORD_TYPES = ['image', 'text', 'person'] as const;

/**
 * Convert cell (x, y) at base resolution to target grid index
 */
function cellToGridIndex(cellX: number, cellY: number, maxCellX: number, maxCellY: number): number {
  const gridCol = Math.floor((cellX / (maxCellX + 1)) * GRID_DEFAULT);
  const gridRow = Math.floor((cellY / (maxCellY + 1)) * GRID_DEFAULT);
  const clampedCol = Math.min(Math.max(gridCol, 0), GRID_DEFAULT - 1);
  const clampedRow = Math.min(Math.max(gridRow, 0), GRID_DEFAULT - 1);
  return clampedRow * GRID_DEFAULT + clampedCol;
}

/**
 * Benchmark 1: Single time slice, combined record types (1 query)
 */
async function benchmarkSingleSliceCombined(maxX: number, maxY: number) {
  const timeSlice = TIME_SLICES[8]; // 1900-1950 (likely has most data)
  const startDate = timeSlice.timeRange.start;
  const endDate = timeSlice.timeRange.end;

  console.log(`\n=== Benchmark 1: Single time slice (${timeSlice.key}), 3 record types combined ===`);
  console.log(`Record types: ${RECORD_TYPES.join(', ')}`);

  const t = Date.now();

  const result = await db.execute<CellCount>(sql`
    SELECT ${featureCells.cellX} as cell_x, ${featureCells.cellY} as cell_y, COUNT(*) as count
    FROM ${featureCells}
    JOIN ${features} ON ${featureCells.featureId} = ${features.id}
    WHERE ${features.recordType} IN ${RECORD_TYPES}
      AND ${features.startDate} >= ${startDate}
      AND ${features.endDate} <= ${endDate}
    GROUP BY ${featureCells.cellX}, ${featureCells.cellY}
  `);

  const queryTime = Date.now() - t;

  // Process into grid
  const t2 = Date.now();
  const countsMap = new Map<number, number>();
  for (const row of result.rows) {
    const gridIndex = cellToGridIndex(Number(row.cell_x), Number(row.cell_y), maxX, maxY);
    countsMap.set(gridIndex, (countsMap.get(gridIndex) || 0) + parseInt(row.count));
  }
  const processTime = Date.now() - t2;

  console.log(`Query time: ${queryTime}ms`);
  console.log(`Process time: ${processTime}ms`);
  console.log(`Total: ${queryTime + processTime}ms`);
  console.log(`Rows returned: ${result.rows.length}`);
  console.log(`Grid cells populated: ${countsMap.size}`);
  console.log(`Total feature count: ${Array.from(countsMap.values()).reduce((a, b) => a + b, 0)}`);

  return { queryTime, processTime, total: queryTime + processTime };
}

/**
 * Benchmark 2: All time slices batched, combined record types (1 query)
 */
async function benchmarkAllSlicesBatched(maxX: number, maxY: number) {
  console.log(`\n=== Benchmark 2: All ${TIME_SLICES.length} time slices batched, 3 record types combined ===`);
  console.log(`Record types: ${RECORD_TYPES.join(', ')}`);

  const t = Date.now();

  const result = await db.execute<CellCountWithTime>(sql`
    SELECT
      ${featureCells.cellX} as cell_x,
      ${featureCells.cellY} as cell_y,
      FLOOR(EXTRACT(YEAR FROM ${features.startDate}) / 50) * 50 as time_bin,
      COUNT(*) as count
    FROM ${featureCells}
    JOIN ${features} ON ${featureCells.featureId} = ${features.id}
    WHERE ${features.recordType} IN ${RECORD_TYPES}
      AND ${features.startDate} IS NOT NULL
      AND ${features.endDate} IS NOT NULL
    GROUP BY ${featureCells.cellX}, ${featureCells.cellY}, time_bin
  `);

  const queryTime = Date.now() - t;

  // Process into grids per time slice
  const t2 = Date.now();
  const heatmapsBySlice = new Map<number, Map<number, number>>();

  for (const row of result.rows) {
    const timeBin = parseInt(row.time_bin);
    if (!heatmapsBySlice.has(timeBin)) {
      heatmapsBySlice.set(timeBin, new Map());
    }
    const countsMap = heatmapsBySlice.get(timeBin)!;
    const gridIndex = cellToGridIndex(Number(row.cell_x), Number(row.cell_y), maxX, maxY);
    countsMap.set(gridIndex, (countsMap.get(gridIndex) || 0) + parseInt(row.count));
  }
  const processTime = Date.now() - t2;

  console.log(`Query time: ${queryTime}ms`);
  console.log(`Process time: ${processTime}ms`);
  console.log(`Total: ${queryTime + processTime}ms`);
  console.log(`Rows returned: ${result.rows.length}`);
  console.log(`Time slices with data: ${heatmapsBySlice.size}`);

  for (const [timeBin, countsMap] of Array.from(heatmapsBySlice.entries()).sort((a, b) => a[0] - b[0])) {
    const total = Array.from(countsMap.values()).reduce((a, b) => a + b, 0);
    console.log(`  ${timeBin}: ${countsMap.size} cells, ${total} features`);
  }

  return { queryTime, processTime, total: queryTime + processTime };
}

/**
 * Benchmark 3 (comparison): Old approach - sequential queries per time slice per record type
 */
async function benchmarkOldApproach(maxX: number, maxY: number) {
  console.log(`\n=== Benchmark 3 (comparison): Old approach - sequential queries ===`);
  console.log(`${TIME_SLICES.length} time slices × ${RECORD_TYPES.length} record types = ${TIME_SLICES.length * RECORD_TYPES.length} queries`);

  const t = Date.now();
  let totalRows = 0;

  for (const timeSlice of TIME_SLICES) {
    for (const recordType of RECORD_TYPES) {
      const result = await db.execute<CellCount>(sql`
        SELECT ${featureCells.cellX} as cell_x, ${featureCells.cellY} as cell_y, COUNT(*) as count
        FROM ${featureCells}
        JOIN ${features} ON ${featureCells.featureId} = ${features.id}
        WHERE ${features.recordType} = ${recordType}
          AND ${features.startDate} >= ${timeSlice.timeRange.start}
          AND ${features.endDate} <= ${timeSlice.timeRange.end}
        GROUP BY ${featureCells.cellX}, ${featureCells.cellY}
      `);
      totalRows += result.rows.length;
    }
  }

  const totalTime = Date.now() - t;

  console.log(`Total time: ${totalTime}ms`);
  console.log(`Avg per query: ${(totalTime / (TIME_SLICES.length * RECORD_TYPES.length)).toFixed(1)}ms`);
  console.log(`Total rows: ${totalRows}`);

  return { total: totalTime };
}

async function main() {
  console.log('=== Heatmap Query Benchmark ===');
  console.log(`Grid: ${GRID_DEFAULT}×${GRID_DEFAULT}`);
  console.log(`Time slices: ${TIME_SLICES.length}`);

  // Get max cell coordinates for scaling
  const boundsResult = await db.execute<MaxCell>(
    sql`SELECT MAX(${featureCells.cellX}) as max_x, MAX(${featureCells.cellY}) as max_y FROM ${featureCells}`
  );
  const { max_x, max_y } = boundsResult.rows[0];
  console.log(`Cell bounds: (0,0) to (${max_x}, ${max_y})`);

  // Run benchmarks
  const results = {
    singleSlice: await benchmarkSingleSliceCombined(max_x, max_y),
    allSlicesBatched: await benchmarkAllSlicesBatched(max_x, max_y),
    oldApproach: await benchmarkOldApproach(max_x, max_y)
  };

  // Summary
  console.log('\n=== Summary ===');
  console.log(`1. Single slice, combined types:  ${results.singleSlice.total}ms (1 query)`);
  console.log(`2. All slices batched:            ${results.allSlicesBatched.total}ms (1 query)`);
  console.log(`3. Old approach (sequential):     ${results.oldApproach.total}ms (${TIME_SLICES.length * RECORD_TYPES.length} queries)`);
  console.log(`\nSpeedup (batched vs old): ${(results.oldApproach.total / results.allSlicesBatched.total).toFixed(1)}x`);

  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
