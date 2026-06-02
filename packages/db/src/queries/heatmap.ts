import { sql } from 'drizzle-orm';
import type { Heatmap, HeatmapTimeline, HeatmapResponse, HeatmapDimensions, HeatmapResolutionConfig, RecordType, PlaceType } from '@atm/shared';
import { DEFAULT_BIN_SIZE } from '@atm/shared';
import { db } from '../client';
import { placeCells, features, featureToPlace, place, gridConfig } from '../schema';
import { computeTimeSlices } from './time-slices';

// Query result types
type CellCount = { cell_x: number; cell_y: number; count: string };
type CellCountWithTime = { cell_x: number; cell_y: number; time_bin: string; count: string };
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
 * Read pre-computed grid config from rebuild-index.
 * Single indexed-row read — not cached, so it always reflects the latest
 * rebuild-index without a staleness window.
 */
async function getGridConfig(): Promise<{ maxX: number; maxY: number; bounds: { minLon: number; maxLon: number; minLat: number; maxLat: number } }> {
  const result = await db.execute<{
    max_cell_x: number; max_cell_y: number;
    min_lon: number; max_lon: number;
    min_lat: number; max_lat: number;
  }>(sql`SELECT * FROM ${gridConfig} WHERE id = 'current'`);

  const row = result.rows[0];
  if (!row) {
    return { maxX: 0, maxY: 0, bounds: { minLon: 0, maxLon: 0, minLat: 0, maxLat: 0 } };
  }

  return {
    maxX: row.max_cell_x,
    maxY: row.max_cell_y,
    bounds: {
      minLon: row.min_lon,
      maxLon: row.max_lon,
      minLat: row.min_lat,
      maxLat: row.max_lat,
    }
  };
}

async function getMaxCellBounds(): Promise<{ maxX: number; maxY: number }> {
  const config = await getGridConfig();
  return { maxX: config.maxX, maxY: config.maxY };
}

async function getBoundsFromData(): Promise<{ minLon: number; maxLon: number; minLat: number; maxLat: number }> {
  return (await getGridConfig()).bounds;
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
  datasetIds?: string[],
  placeTypes?: PlaceType[],
  binSizeYears: number = DEFAULT_BIN_SIZE
): Promise<HeatmapResponse> {
  const types = recordTypes || await getRecordTypes();
  const timeSlices = await computeTimeSlices(binSizeYears);
  const timeSlice = timeSlices.find(ts => ts.key === timeSliceKey);

  if (!timeSlice) {
    throw new Error(`Unknown time slice: ${timeSliceKey}`);
  }

  const [{ maxX, maxY }, bounds] = await Promise.all([
    getMaxCellBounds(),
    getBoundsFromData()
  ]);

  const gridCols = Math.min(resolution.cols, maxX + 1);
  const gridRows = Math.min(resolution.rows, maxY + 1);

  const startDate = timeSlice.timeRange.start;
  const endDate = timeSlice.timeRange.end;

  const result = await db.execute<CellCount>(sql`
    SELECT ${placeCells.cellX} as cell_x, ${placeCells.cellY} as cell_y, COUNT(DISTINCT ${features.id}) as count
    FROM ${placeCells}
    JOIN ${featureToPlace} ON ${placeCells.placeId} = ${featureToPlace.placeId}
    JOIN ${features} ON ${featureToPlace.featureId} = ${features.id}
    JOIN ${place} ON ${placeCells.placeId} = ${place.id}
    WHERE ${features.recordType} IN ${types}
      ${datasetIds && datasetIds.length > 0 ? sql`AND ${features.datasetId} IN ${datasetIds}` : sql``}
      ${placeTypes && placeTypes.length > 0 ? sql`AND ${place.type} IN ${placeTypes}` : sql``}
      AND ${features.startDate} <= ${endDate}
      AND ${features.endDate} >= ${startDate}
    GROUP BY ${placeCells.cellX}, ${placeCells.cellY}
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
  datasetIds?: string[],
  placeTypes?: PlaceType[],
  binSizeYears: number = DEFAULT_BIN_SIZE
): Promise<HeatmapResponse> {
  const types = recordTypes || await getRecordTypes();
  const timeSlices = await computeTimeSlices(binSizeYears);

  if (types.length === 0 || timeSlices.length === 0) {
    return {
      dimensions: buildDimensions(0, 0, { minLon: 0, maxLon: 0, minLat: 0, maxLat: 0 }),
      timeline: {}
    };
  }

  const [{ maxX, maxY }, bounds] = await Promise.all([
    getMaxCellBounds(),
    getBoundsFromData()
  ]);

  const gridCols = Math.min(resolution.cols, maxX + 1);
  const gridRows = Math.min(resolution.rows, maxY + 1);

  const firstSlice = timeSlices[0];
  const lastSlice = timeSlices[timeSlices.length - 1];

  const result = await db.execute<CellCountWithTime>(sql`
    WITH slices AS (
      SELECT gs AS bin_start, gs + ${binSizeYears}::int AS bin_end
      FROM generate_series(${firstSlice.startYear}::int, ${lastSlice.startYear}::int, ${binSizeYears}::int) AS gs
    )
    SELECT
      ${placeCells.cellX} as cell_x,
      ${placeCells.cellY} as cell_y,
      s.bin_start as time_bin,
      COUNT(DISTINCT ${features.id}) as count
    FROM ${placeCells}
    JOIN ${featureToPlace} ON ${placeCells.placeId} = ${featureToPlace.placeId}
    JOIN ${features} ON ${featureToPlace.featureId} = ${features.id}
    JOIN ${place} ON ${placeCells.placeId} = ${place.id}
    JOIN slices s ON EXTRACT(YEAR FROM ${features.startDate}) < s.bin_end
                 AND EXTRACT(YEAR FROM ${features.endDate}) >= s.bin_start
    WHERE ${features.recordType} IN ${types}
      ${datasetIds && datasetIds.length > 0 ? sql`AND ${features.datasetId} IN ${datasetIds}` : sql``}
      ${placeTypes && placeTypes.length > 0 ? sql`AND ${place.type} IN ${placeTypes}` : sql``}
      AND ${features.startDate} IS NOT NULL
      AND ${features.endDate} IS NOT NULL
    GROUP BY ${placeCells.cellX}, ${placeCells.cellY}, s.bin_start
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
  for (const timeSlice of timeSlices) {
    const countsMap = countsBySlice.get(timeSlice.startYear) || new Map();
    timeline[timeSlice.key] = buildSparseHeatmap(countsMap);
  }

  return {
    dimensions: buildDimensions(gridCols, gridRows, bounds),
    timeline
  };
}
