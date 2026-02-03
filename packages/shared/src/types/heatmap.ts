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
 * Grid dimensions with geographic bounds (from metadata API)
 */
export interface HeatmapDimensions {
  colsAmount: number;
  rowsAmount: number;
  cellWidth: number;
  cellHeight: number;
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
