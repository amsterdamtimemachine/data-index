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
 * Grid configuration for heatmap resolution
 */
export interface HeatmapResolutionConfig {
  cols: number;
  rows: number;
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
