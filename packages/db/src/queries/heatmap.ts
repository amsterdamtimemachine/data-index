import { sql } from 'drizzle-orm';
import type { Heatmap, HeatmapTimeline, HeatmapResponse, HeatmapDimensions, HeatmapResolutionConfig, RecordType, PlaceType } from '@atm/shared';
import { DEFAULT_BIN_SIZE, CELL_SIZE_METERS } from '@atm/shared';
import { db } from '../client';
import { placeCells, features, featureToPlace, place } from '../schema';
import { computeTimeSlices } from './time-slices';
import { getRecordTypes } from './record-types';
import { getGridConfig } from './grid-config';
import { featureYearOverlap, slicesCTE } from './time-filter';
import { andIn } from './filters';

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
 * Build HeatmapDimensions from grid resolution and geographic bounds
 */
function buildDimensions(
  cols: number,
  rows: number,
  bounds: { minLon: number; maxLon: number; minLat: number; maxLat: number },
  rd?: { originX: number; originY: number; cellWidth: number; cellHeight: number }
): HeatmapDimensions {
  return {
    colsAmount: cols,
    rowsAmount: rows,
    ...bounds,
    ...(rd && {
      rdOriginX: rd.originX,
      rdOriginY: rd.originY,
      rdCellWidth: rd.cellWidth,
      rdCellHeight: rd.cellHeight
    })
  };
}

/**
 * RD/28992 geometry of the display grid: origin + metres-per-display-cell. Lets
 * the client reproject cells to their true WGS84 footprint (see HeatmapDimensions).
 */
function buildRd(minX: number, minY: number, maxCellX: number, maxCellY: number, gridCols: number, gridRows: number) {
  return {
    originX: minX,
    originY: minY,
    cellWidth: ((maxCellX + 1) * CELL_SIZE_METERS) / gridCols,
    cellHeight: ((maxCellY + 1) * CELL_SIZE_METERS) / gridRows
  };
}

/**
 * Derive the display grid from a width (cols) only. Rows follow the data's
 * aspect ratio — (maxCellY+1)/(maxCellX+1) — so each display cell is square in RD
 * metres (and, since Web Mercator is conformal, square on screen). Both axes are
 * capped at the base-cell resolution.
 */
function deriveGrid(cols: number, maxCellX: number, maxCellY: number): { gridCols: number; gridRows: number } {
  const gridCols = Math.min(cols, maxCellX + 1);
  const gridRows = Math.min(
    Math.max(1, Math.round((gridCols * (maxCellY + 1)) / (maxCellX + 1))),
    maxCellY + 1
  );
  return { gridCols, gridRows };
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

  // No record types means no data — return an empty heatmap rather than emitting
  // `record_type IN ()`. Matches getHeatmapTimeline / getHistogram / getFeatures.
  if (types.length === 0) {
    return {
      dimensions: buildDimensions(0, 0, { minLon: 0, maxLon: 0, minLat: 0, maxLat: 0 }),
      timeline: { [timeSliceKey]: buildSparseHeatmap(new Map()) }
    };
  }

  const timeSlices = await computeTimeSlices(binSizeYears);
  const timeSlice = timeSlices.find(ts => ts.key === timeSliceKey);

  if (!timeSlice) {
    throw new Error(`Unknown time slice: ${timeSliceKey}`);
  }

  const config = await getGridConfig();
  const maxX = config.maxCellX;
  const maxY = config.maxCellY;
  const bounds = { minLon: config.minLon, maxLon: config.maxLon, minLat: config.minLat, maxLat: config.maxLat };

  const { gridCols, gridRows } = deriveGrid(resolution.cols, maxX, maxY);

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
      ${andIn(sql`${features.datasetId}`, datasetIds)}
      ${andIn(sql`${place.type}`, placeTypes)}
      AND ${featureYearOverlap(sql`${features.startDate}`, sql`${features.endDate}`, startYear, endYear)}
    GROUP BY grid_col, grid_row
  `);

  const countsMap = new Map<number, number>();
  for (const row of result.rows) {
    const gridIndex = Number(row.grid_row) * gridCols + Number(row.grid_col);
    countsMap.set(gridIndex, parseInt(row.count));
  }

  const rd = buildRd(config.minX, config.minY, maxX, maxY, gridCols, gridRows);

  return {
    dimensions: buildDimensions(gridCols, gridRows, bounds, rd),
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

  const config = await getGridConfig();
  const maxX = config.maxCellX;
  const maxY = config.maxCellY;
  const bounds = { minLon: config.minLon, maxLon: config.maxLon, minLat: config.minLat, maxLat: config.maxLat };

  const { gridCols, gridRows } = deriveGrid(resolution.cols, maxX, maxY);

  const firstSlice = timeSlices[0];
  const lastSlice = timeSlices[timeSlices.length - 1];

  const result = await db.execute<GridCellCountWithTime>(sql`
    WITH ${slicesCTE(firstSlice.startYear, lastSlice.startYear, binSizeYears)}
    SELECT
      ${gridColExpr(gridCols, maxX)} as grid_col,
      ${gridRowExpr(gridRows, maxY)} as grid_row,
      s.bin_start as time_bin,
      COUNT(DISTINCT ${features.id}) as count
    FROM ${placeCells}
    JOIN ${featureToPlace} ON ${placeCells.placeId} = ${featureToPlace.placeId}
    JOIN ${features} ON ${featureToPlace.featureId} = ${features.id}
    JOIN ${place} ON ${placeCells.placeId} = ${place.id}
    JOIN slices s ON ${featureYearOverlap(sql`${features.startDate}`, sql`${features.endDate}`, sql`s.bin_start`, sql`s.bin_end`)}
    WHERE ${features.recordType} IN ${types}
      ${andIn(sql`${features.datasetId}`, datasetIds)}
      ${andIn(sql`${place.type}`, placeTypes)}
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

  const rd = buildRd(config.minX, config.minY, maxX, maxY, gridCols, gridRows);

  return {
    dimensions: buildDimensions(gridCols, gridRows, bounds, rd),
    timeline
  };
}
