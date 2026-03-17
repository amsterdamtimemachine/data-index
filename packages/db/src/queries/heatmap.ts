import { sql } from 'drizzle-orm';
import type { Heatmap, HeatmapTimeline, HeatmapResponse, HeatmapDimensions, HeatmapResolutionConfig, RecordType } from '@atm/shared';
import { TIME_SLICES } from '@atm/shared';
import { db } from '../client';
import { featureCells, features, place } from '../schema';

// Query result types
type CellCount = { cell_x: number; cell_y: number; count: string };
type CellCountWithTime = { cell_x: number; cell_y: number; time_bin: string; count: string };
type MaxCell = { max_x: number; max_y: number };
type BoundsRow = { min_lon: string; max_lon: string; min_lat: string; max_lat: string };
type RecordTypeRow = { record_type: RecordType };

/**
 * Convert cell (x, y) at base resolution to target grid index
 */
function cellToGridIndex(
  cellX: number, cellY: number,
  maxCellX: number, maxCellY: number,
  gridCols: number, gridRows: number
): number {
  const gridCol = Math.floor((cellX / (maxCellX + 1)) * gridCols);
  const gridRow = Math.floor((cellY / (maxCellY + 1)) * gridRows);
  const clampedCol = Math.min(Math.max(gridCol, 0), gridCols - 1);
  const clampedRow = Math.min(Math.max(gridRow, 0), gridRows - 1);
  return clampedRow * gridCols + clampedCol;
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

  return { indices, counts };
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
 * Get geographic bounds from actual data extent (WGS84)
 */
async function getBoundsFromData(): Promise<{ minLon: number; maxLon: number; minLat: number; maxLat: number }> {
  const result = await db.execute<BoundsRow>(sql`
    SELECT
      ST_XMin(ST_Extent(ST_Transform(${place.geometry}, 4326))) as min_lon,
      ST_XMax(ST_Extent(ST_Transform(${place.geometry}, 4326))) as max_lon,
      ST_YMin(ST_Extent(ST_Transform(${place.geometry}, 4326))) as min_lat,
      ST_YMax(ST_Extent(ST_Transform(${place.geometry}, 4326))) as max_lat
    FROM ${place}
    WHERE ${place.geometry} IS NOT NULL
  `);
  const row = result.rows[0];
  return {
    minLon: parseFloat(row.min_lon),
    maxLon: parseFloat(row.max_lon),
    minLat: parseFloat(row.min_lat),
    maxLat: parseFloat(row.max_lat)
  };
}

/**
 * Build HeatmapDimensions from grid resolution and geographic bounds
 */
function buildDimensions(cols: number, rows: number, bounds: { minLon: number; maxLon: number; minLat: number; maxLat: number }): HeatmapDimensions {
  return {
    colsAmount: cols,
    rowsAmount: rows,
    ...bounds
  };
}

/**
 * Get heatmap for a single time slice with combined record types
 */
export async function getHeatmap(
  timeSliceKey: string,
  resolution: HeatmapResolutionConfig,
  recordTypes?: RecordType[],
): Promise<HeatmapResponse> {
  const types = recordTypes || await getRecordTypes();
  const { cols: gridCols, rows: gridRows } = resolution;
  const timeSlice = TIME_SLICES.find(ts => ts.key === timeSliceKey);

  if (!timeSlice) {
    throw new Error(`Unknown time slice: ${timeSliceKey}`);
  }

  const [{ maxX, maxY }, bounds] = await Promise.all([
    getMaxCellBounds(),
    getBoundsFromData()
  ]);

  const startDate = timeSlice.timeRange.start;
  const endDate = timeSlice.timeRange.end;

  const result = await db.execute<CellCount>(sql`
    SELECT ${featureCells.cellX} as cell_x, ${featureCells.cellY} as cell_y, COUNT(*) as count
    FROM ${featureCells}
    JOIN ${features} ON ${featureCells.featureId} = ${features.id}
    WHERE ${features.recordType} IN ${types}
      AND ${features.startDate} >= ${startDate}
      AND ${features.endDate} <= ${endDate}
    GROUP BY ${featureCells.cellX}, ${featureCells.cellY}
  `);

  const countsMap = new Map<number, number>();
  for (const row of result.rows) {
    const gridIndex = cellToGridIndex(Number(row.cell_x), Number(row.cell_y), maxX, maxY, gridCols, gridRows);
    countsMap.set(gridIndex, (countsMap.get(gridIndex) || 0) + parseInt(row.count));
  }

  return {
    dimensions: buildDimensions(gridCols, gridRows, bounds),
    timeline: { [timeSliceKey]: buildSparseHeatmap(countsMap) }
  };
}

/**
 * Get heatmap timeline for all time slices with combined record types
 */
export async function getHeatmapTimeline(
  resolution: HeatmapResolutionConfig,
  recordTypes?: RecordType[],
): Promise<HeatmapResponse> {
  const types = recordTypes || await getRecordTypes();
  const { cols: gridCols, rows: gridRows } = resolution;

  const [{ maxX, maxY }, bounds] = await Promise.all([
    getMaxCellBounds(),
    getBoundsFromData()
  ]);

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

  const countsBySlice = new Map<number, Map<number, number>>();
  for (const row of result.rows) {
    const timeBin = parseInt(row.time_bin);
    if (!countsBySlice.has(timeBin)) {
      countsBySlice.set(timeBin, new Map());
    }
    const countsMap = countsBySlice.get(timeBin)!;
    const gridIndex = cellToGridIndex(Number(row.cell_x), Number(row.cell_y), maxX, maxY, gridCols, gridRows);
    countsMap.set(gridIndex, (countsMap.get(gridIndex) || 0) + parseInt(row.count));
  }

  const timeline: HeatmapTimeline = {};
  for (const timeSlice of TIME_SLICES) {
    const countsMap = countsBySlice.get(timeSlice.startYear) || new Map();
    timeline[timeSlice.key] = buildSparseHeatmap(countsMap);
  }

  return {
    dimensions: buildDimensions(gridCols, gridRows, bounds),
    timeline
  };
}
