import { sql } from 'drizzle-orm';
import type { Heatmap, HeatmapTimeline, HeatmapResponse, HeatmapDimensions, HeatmapResolutionConfig, RecordType, PlaceType } from '@atm/shared';
import { DEFAULT_BIN_SIZE } from '@atm/shared';
import { db } from '../client';
import { placeCells, features, featureToPlace, place, gridConfig } from '../schema';
import { computeTimeSlices } from './time-slices';
import { getRecordTypes } from './record-types';

// Query result types
type GridCellCount = { grid_col: number; grid_row: number; count: string };
type GridCellCountWithTime = { grid_col: number; grid_row: number; time_bin: string; count: string };

/**
 * SQL expressions that map a base cell (place_cells) to a display grid cell.
 * Forward partition: display = floor(cell * gridN / (maxN + 1)), clamped.
 * getFeatures uses the exact inverse of this partition, so heatmap counts and
 * the per-cell feature list always agree.
 */
function gridColExpr(gridCols: number, maxX: number) {
  return sql`LEAST(FLOOR(${placeCells.cellX}::numeric * ${gridCols} / ${maxX + 1})::int, ${gridCols - 1})`;
}
function gridRowExpr(gridRows: number, maxY: number) {
  return sql`LEAST(FLOOR(${placeCells.cellY}::numeric * ${gridRows} / ${maxY + 1})::int, ${gridRows - 1})`;
}

/**
 * Convert cell (x, y) at base resolution to target grid index
 */
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

  // Half-open, year-based window — identical to getFeatures and getHeatmapTimeline,
  // so slices don't overlap on boundary years and per-cell counts agree across all three.
  const startYear = timeSlice.startYear;
  const endYear = timeSlice.endYear;

  const result = await db.execute<GridCellCount>(sql`
    SELECT
      ${gridColExpr(gridCols, maxX)} as grid_col,
      ${gridRowExpr(gridRows, maxY)} as grid_row,
      COUNT(DISTINCT ${features.id}) as count
    FROM ${placeCells}
    JOIN ${featureToPlace} ON ${placeCells.placeId} = ${featureToPlace.placeId}
    JOIN ${features} ON ${featureToPlace.featureId} = ${features.id}
    JOIN ${place} ON ${placeCells.placeId} = ${place.id}
    WHERE ${features.recordType} IN ${types}
      ${datasetIds && datasetIds.length > 0 ? sql`AND ${features.datasetId} IN ${datasetIds}` : sql``}
      ${placeTypes && placeTypes.length > 0 ? sql`AND ${place.type} IN ${placeTypes}` : sql``}
      AND EXTRACT(YEAR FROM ${features.startDate}) < ${endYear}
      AND EXTRACT(YEAR FROM ${features.endDate}) >= ${startYear}
    GROUP BY grid_col, grid_row
  `);

  const countsMap = new Map<number, number>();
  for (const row of result.rows) {
    const gridIndex = Number(row.grid_row) * gridCols + Number(row.grid_col);
    countsMap.set(gridIndex, parseInt(row.count));
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

  const result = await db.execute<GridCellCountWithTime>(sql`
    WITH slices AS (
      SELECT gs AS bin_start, gs + ${binSizeYears}::int AS bin_end
      FROM generate_series(${firstSlice.startYear}::int, ${lastSlice.startYear}::int, ${binSizeYears}::int) AS gs
    )
    SELECT
      ${gridColExpr(gridCols, maxX)} as grid_col,
      ${gridRowExpr(gridRows, maxY)} as grid_row,
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
    GROUP BY grid_col, grid_row, s.bin_start
  `);

  const countsBySlice = new Map<number, Map<number, number>>();
  for (const row of result.rows) {
    const timeBin = parseInt(row.time_bin);
    if (!countsBySlice.has(timeBin)) {
      countsBySlice.set(timeBin, new Map());
    }
    const countsMap = countsBySlice.get(timeBin)!;
    const gridIndex = Number(row.grid_row) * gridCols + Number(row.grid_col);
    countsMap.set(gridIndex, parseInt(row.count));
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
