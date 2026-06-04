/**
 * Sparse heatmap representation - only non-zero cells are stored
 * Uses parallel arrays for compact serialization
 */
export interface Heatmap {
  indices: number[];  // Cell indices (row * cols + col) with non-zero values
  counts: number[];   // Feature count for corresponding indices
}

/**
 * Heatmap data for all time slices
 */
export interface HeatmapTimeline {
  [timeSliceKey: string]: Heatmap;
}

/**
 * Heatmap display resolution. Only the width (number of columns) is given; the
 * backend derives the row count from the data's aspect ratio so display cells
 * come out square (see getHeatmap / deriveGrid).
 */
export interface HeatmapResolutionConfig {
  cols: number;
}

/**
 * Grid dimensions with geographic bounds (from the heatmap API).
 *
 * The bounds are the WGS84 envelope of the cell-grid rectangle (grid-aligned),
 * NOT the data envelope — so uniformly dividing [minLon, maxLon] × [minLat,
 * maxLat] into colsAmount × rowsAmount tiles the exact grid the heatmap counts.
 */
export interface HeatmapDimensions {
  colsAmount: number;
  rowsAmount: number;
  minLon: number;
  maxLon: number;
  minLat: number;
  maxLat: number;
  // RD/28992 grid geometry, in metres: the grid origin and the per-display-cell
  // step. Optional — when present, the client can reproject each cell to its true
  // (rotated) WGS84 footprint via proj4 instead of drawing axis-aligned lon/lat
  // rectangles, removing the ~0.4° RD↔WGS84 rotation skew. A display cell (col,row)
  // spans RD [originX + col·cellWidth, …] × [originY + row·cellHeight, …].
  rdOriginX?: number;
  rdOriginY?: number;
  rdCellWidth?: number;
  rdCellHeight?: number;
}

/**
 * Geographic bounds for a cell
 */
export interface HeatmapCellBounds {
  minLon: number;
  maxLon: number;
  minLat: number;
  maxLat: number;
}

/**
 * Complete heatmap API response — timeline data + grid dimensions
 */
export interface HeatmapResponse {
  dimensions: HeatmapDimensions;
  timeline: HeatmapTimeline;
}
