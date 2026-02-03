import { sql } from 'drizzle-orm';
import type { Heatmap, HeatmapTimeline, RecordType } from '@atm/shared';
import { TIME_SLICES, GRID_ROWS, GRID_COLS } from '@atm/shared';
import { db } from '../client';
import { featureCells, features } from '../schema';

// Query result types
type CellCount = { cell_x: number; cell_y: number; count: string };
type CellCountWithTime = { cell_x: number; cell_y: number; time_bin: string; count: string };
type MaxCell = { max_x: number; max_y: number };
type RecordTypeRow = { record_type: RecordType };

/**
 * Convert cell (x, y) at base resolution to target grid index
 */
function cellToGridIndex(cellX: number, cellY: number, maxCellX: number, maxCellY: number): number {
  const gridCol = Math.floor((cellX / (maxCellX + 1)) * GRID_COLS);
  const gridRow = Math.floor((cellY / (maxCellY + 1)) * GRID_ROWS);
  const clampedCol = Math.min(Math.max(gridCol, 0), GRID_COLS - 1);
  const clampedRow = Math.min(Math.max(gridRow, 0), GRID_ROWS - 1);
  return clampedRow * GRID_COLS + clampedCol;
}

/**
 * Build sparse heatmap from counts map
 */
function buildSparseHeatmap(countsMap: Map<number, number>): Heatmap {
  const indices: number[] = [];
  const counts: number[] = [];

  const sortedEntries = Array.from(countsMap.entries()).sort((a, b) => a[0] - b[0]);

  for (const [index, count] of sortedEntries) {
    indices.push(index);
    counts.push(count);
  }

  const densities: number[] = [];
  if (counts.length > 0) {
    const maxCount = Math.max(...counts);
    const maxTransformed = Math.log(maxCount + 1);
    for (const count of counts) {
      densities.push(Math.log(count + 1) / maxTransformed);
    }
  }

  return {
    indices,
    counts,
    densities,
    dimensions: { rows: GRID_ROWS, cols: GRID_COLS }
  };
}

/**
 * Get all available record types from the database
 */
async function getRecordTypes(): Promise<RecordType[]> {
  const result = await db.execute<RecordTypeRow>(
    sql`SELECT DISTINCT ${features.recordType} as record_type FROM ${features} WHERE ${features.recordType} IS NOT NULL`
  );
  return result.rows.map(r => r.record_type);
}

/**
 * Get max cell coordinates for scaling to grid
 */
async function getMaxCellBounds(): Promise<{ maxX: number; maxY: number }> {
  const result = await db.execute<MaxCell>(
    sql`SELECT MAX(${featureCells.cellX}) as max_x, MAX(${featureCells.cellY}) as max_y FROM ${featureCells}`
  );
  return { maxX: result.rows[0].max_x, maxY: result.rows[0].max_y };
}

/**
 * Get heatmap for a single time slice with combined record types
 * Optimized: 1 query regardless of how many record types
 */
export async function getHeatmap(
  timeSliceKey: string,
  recordTypes?: RecordType[]
): Promise<{ heatmap: Heatmap; processingTime: number }> {
  const t = Date.now();

  const types = recordTypes || await getRecordTypes();
  const timeSlice = TIME_SLICES.find(ts => ts.key === timeSliceKey);

  if (!timeSlice) {
    throw new Error(`Unknown time slice: ${timeSliceKey}`);
  }

  const { maxX, maxY } = await getMaxCellBounds();
  const startDate = timeSlice.timeRange.start;
  const endDate = timeSlice.timeRange.end;

  // Single query with IN clause for combined record types
  const result = await db.execute<CellCount>(sql`
    SELECT ${featureCells.cellX} as cell_x, ${featureCells.cellY} as cell_y, COUNT(*) as count
    FROM ${featureCells}
    JOIN ${features} ON ${featureCells.featureId} = ${features.id}
    WHERE ${features.recordType} IN ${types}
      AND ${features.startDate} >= ${startDate}
      AND ${features.endDate} <= ${endDate}
    GROUP BY ${featureCells.cellX}, ${featureCells.cellY}
  `);

  // Process into grid
  const countsMap = new Map<number, number>();
  for (const row of result.rows) {
    const gridIndex = cellToGridIndex(Number(row.cell_x), Number(row.cell_y), maxX, maxY);
    countsMap.set(gridIndex, (countsMap.get(gridIndex) || 0) + parseInt(row.count));
  }

  return {
    heatmap: buildSparseHeatmap(countsMap),
    processingTime: Date.now() - t
  };
}

/**
 * Get heatmap timeline for all time slices with combined record types
 * Optimized: 1 query for all time slices using GROUP BY time_bin
 */
export async function getHeatmapTimeline(
  recordTypes?: RecordType[]
): Promise<{ heatmapTimeline: HeatmapTimeline; processingTime: number }> {
  const t = Date.now();

  const types = recordTypes || await getRecordTypes();
  const { maxX, maxY } = await getMaxCellBounds();

  // Single query with GROUP BY time_bin for all time slices
  const result = await db.execute<CellCountWithTime>(sql`
    SELECT
      ${featureCells.cellX} as cell_x,
      ${featureCells.cellY} as cell_y,
      FLOOR(EXTRACT(YEAR FROM ${features.startDate}) / 50) * 50 as time_bin,
      COUNT(*) as count
    FROM ${featureCells}
    JOIN ${features} ON ${featureCells.featureId} = ${features.id}
    WHERE ${features.recordType} IN ${types}
      AND ${features.startDate} IS NOT NULL
      AND ${features.endDate} IS NOT NULL
    GROUP BY ${featureCells.cellX}, ${featureCells.cellY}, time_bin
  `);

  // Group results by time slice
  const countsBySlice = new Map<number, Map<number, number>>();
  for (const row of result.rows) {
    const timeBin = parseInt(row.time_bin);
    if (!countsBySlice.has(timeBin)) {
      countsBySlice.set(timeBin, new Map());
    }
    const countsMap = countsBySlice.get(timeBin)!;
    const gridIndex = cellToGridIndex(Number(row.cell_x), Number(row.cell_y), maxX, maxY);
    countsMap.set(gridIndex, (countsMap.get(gridIndex) || 0) + parseInt(row.count));
  }

  // Build heatmap timeline structure
  const heatmapTimeline: HeatmapTimeline = {};

  for (const timeSlice of TIME_SLICES) {
    const countsMap = countsBySlice.get(timeSlice.startYear) || new Map();
    const heatmap = buildSparseHeatmap(countsMap);

    heatmapTimeline[timeSlice.key] = {
      combined: {
        base: heatmap,
        tags: {}
      }
    };
  }

  return {
    heatmapTimeline,
    processingTime: Date.now() - t
  };
}
