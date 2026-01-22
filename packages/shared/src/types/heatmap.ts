import type { RecordType } from './feature';

/**
 * Sparse heatmap representation - only non-zero cells are stored
 * Uses parallel arrays for compact msgpack encoding
 */
export interface Heatmap {
  indices: number[];      // Cell indices (row * cols + col) with non-zero values
  counts: number[];       // Count values for corresponding indices
  densities: number[];    // Density values (0-1) for corresponding indices
  dimensions: {           // Grid dimensions for validation
    rows: number;
    cols: number;
  };
}

export interface HeatmapTimeline {
  [timeSliceKey: string]: {
    [recordType in RecordType]: {
      base: Heatmap;
      tags: Record<string, Heatmap>;
    }
  };
}

export interface HeatmapResolutions {
  [resolution: string]: HeatmapTimeline;
}

export interface HeatmapResolutionConfig {
  cols: number;
  rows: number;
}

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

// Generic Bounds from spatial.ts should be used instead of this
export interface HeatmapCellBounds { 
    minLon: number;
    maxLon: number;
    minLat: number;
    maxLat: number;
}


/**
 * Lightweight blueprint - only store grid metadata, not all cells
 * Use this for client-side calculations instead of storing full cell list
 */
export interface HeatmapBlueprintMetadata {
  rows: number;
  cols: number;
  bounds: {
    minLon: number;
    maxLon: number;
    minLat: number;
    maxLat: number;
  };
}

export interface HeatmapCellCounts {
  // Base counts per recordtype per cell
  base: Map<RecordType, Map<string, number>>;
  // Tag counts per tag per recordtype per cell  
  tags: Map<string, Map<RecordType, Map<string, number>>>;
  // Tag combination counts per combination per recordtype per cell
  tagCombinations: Map<string, Map<RecordType, Map<string, number>>>;
}

export interface HeatmapAccumulator {
  cellCounts: HeatmapCellCounts;
  heatmapDimensions: HeatmapDimensions;
  collectedTags: Set<string>;
  maxTagCombinations: number;
  tagCombinationStats: Map<string, number>;
}

export interface HeatmapConfig {
  colsAmount: number;
  rowsAmount: number;
  padding: number;
}


