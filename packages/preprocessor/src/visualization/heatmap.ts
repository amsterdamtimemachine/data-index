// src/visualization/heatmap.ts - Dynamic heatmap generation with vocabulary discovery

import type { 
  MinimalFeature,
  HeatmapDimensions, 
  DatabaseConfig,
  ChunkingConfig,
  HeatmapTimeline,
  HeatmapResolutions,
  HeatmapResolutionConfig,
  HeatmapCellBounds,
  HeatmapBlueprint,
  TimeSlice,
  VocabularyTracker,
  DiscoveryHeatmapAccumulator
} from '@atm/shared/types';
import { 
  streamFeaturesWithDiscovery, 
  createVocabularyTracker, 
  mergeVocabularies
} from '../data-sources/streaming';
// Utility functions merged from heatmap.ts

/**
 * Get cell ID from coordinates
 * Updated to match API ST_Intersects behavior (inclusive on all boundaries)
 */
export function getCellIdForCoordinates(
  coordinates: { lon: number; lat: number },
  heatmapDimensions: HeatmapDimensions
): string | null {
  let col = Math.floor((coordinates.lon - heatmapDimensions.minLon) / heatmapDimensions.cellWidth);
  let row = Math.floor((coordinates.lat - heatmapDimensions.minLat) / heatmapDimensions.cellHeight);

  // Handle upper boundary inclusively to match ST_Intersects behavior in API
  // Features exactly on maxLon/maxLat should be assigned to the last cell
  if (coordinates.lon === heatmapDimensions.maxLon && col >= heatmapDimensions.colsAmount) {
    col = heatmapDimensions.colsAmount - 1;
  }
  if (coordinates.lat === heatmapDimensions.maxLat && row >= heatmapDimensions.rowsAmount) {
    row = heatmapDimensions.rowsAmount - 1;
  }

  if (row >= 0 && row < heatmapDimensions.rowsAmount && col >= 0 && col < heatmapDimensions.colsAmount) {
    return `${row}_${col}`;
  }
  return null;
}

/**
 * Generate sparse heatmap from count data
 * Only stores non-zero cells for efficient transmission
 */
export function generateHeatmap(
  counts: Map<string, number>,
  heatmapDimensions: HeatmapDimensions
): { indices: number[]; counts: number[]; densities: number[]; dimensions: { rows: number; cols: number } } {
  const indices: number[] = [];
  const countValues: number[] = [];

  // Collect non-zero cells
  for (const [cellId, count] of Array.from(counts.entries())) {
    if (count > 0) {
      const [row, col] = cellId.split('_').map(Number);
      const index = row * heatmapDimensions.colsAmount + col;
      indices.push(index);
      countValues.push(count);
    }
  }

  // Calculate densities with log transformation
  const densities: number[] = [];
  if (countValues.length > 0) {
    const maxCount = Math.max(...countValues);
    const maxTransformed = Math.log(maxCount + 1);

    for (const count of countValues) {
      densities.push(Math.log(count + 1) / maxTransformed);
    }
  }

  return {
    indices,
    counts: countValues,
    densities,
    dimensions: {
      rows: heatmapDimensions.rowsAmount,
      cols: heatmapDimensions.colsAmount
    }
  };
}

/**
 * Calculate cell bounds from row/col position
 * Updated to match inclusive boundary logic in getCellIdForCoordinates
 */
export function calculateCellBounds(
  row: number, 
  col: number, 
  heatmapDimensions: HeatmapDimensions
): HeatmapCellBounds {
  const cellWidth = (heatmapDimensions.maxLon - heatmapDimensions.minLon) / heatmapDimensions.colsAmount;
  const cellHeight = (heatmapDimensions.maxLat - heatmapDimensions.minLat) / heatmapDimensions.rowsAmount;
  
  const minlon = heatmapDimensions.minLon + (col * cellWidth);
  const minlat = heatmapDimensions.minLat + (row * cellHeight);
  
  let maxlon = minlon + cellWidth;
  let maxlat = minlat + cellHeight;
  
  // For the last column/row, use exact boundary to match inclusive assignment logic
  // This ensures API queries include the same boundary features that were assigned during preprocessing
  if (col === heatmapDimensions.colsAmount - 1) {
    maxlon = heatmapDimensions.maxLon;
  }
  if (row === heatmapDimensions.rowsAmount - 1) {
    maxlat = heatmapDimensions.maxLat;
  }

  return { minLon: minlon, maxLon: maxlon, minLat: minlat, maxLat: maxlat };
}

/**
 * Generate heatmap blueprint from grid dimensions
 * @deprecated This function is no longer used. Cell bounds are now calculated client-side using calculateCellBounds().
 * Kept for backwards compatibility only.
 */
export function generateHeatmapBlueprint(heatmapDimensions: HeatmapDimensions): HeatmapBlueprint {
  const cells = [];
  
  for (let row = 0; row < heatmapDimensions.rowsAmount; row++) {
    for (let col = 0; col < heatmapDimensions.colsAmount; col++) {
      const cellId = `${row}_${col}`;
      const bounds = calculateCellBounds(row, col, heatmapDimensions);
      
      cells.push({
        cellId,
        row,
        col,
        bounds
      });
    }
  }
  
  return {
    rows: heatmapDimensions.rowsAmount,
    cols: heatmapDimensions.colsAmount,
    cells
  };
}

/**
 * Convenience function to create TimeSlice from simple time range
 */
export function createTimeSlice(
  startYear: number,
  endYear: number,
  options?: {
    keyFormat?: 'underscore' | 'hyphen';
    labelFormat?: 'hyphen' | 'to';
  }
): TimeSlice {
  const keyFormat = options?.keyFormat || 'underscore';
  const labelFormat = options?.labelFormat || 'hyphen';
  
  const key = keyFormat === 'underscore' ? `${startYear}_${endYear}` : `${startYear}-${endYear}`;
  const label = labelFormat === 'hyphen' ? `${startYear}-${endYear}` : `${startYear} to ${endYear}`;
  
  return {
    key,
    label,
    timeRange: {
      start: `${startYear}-01-01`,
      end: `${endYear}-12-31`
    },
    startYear,
    endYear,
    durationYears: endYear - startYear
  };
}

/**
 * Create multiple TimeSlices for common periods
 */
export function createTimeSlices(periods: Array<{ start: number; end: number }>): TimeSlice[] {
  return periods.map(period => createTimeSlice(period.start, period.end));
}

/**
 * Generate all tag combinations up to maxLength
 */
export function generateTagCombinations(tags: string[], maxLength: number): string[][] {
  const combinations: string[][] = [];
  
  // Generate combinations of length 2 to maxLength
  for (let length = 2; length <= Math.min(maxLength, tags.length); length++) {
    const combos = getCombinations(tags, length);
    combinations.push(...combos);
  }
  
  return combinations;
}

/**
 * Get combinations of specific length (helper function)
 */
function getCombinations(arr: string[], length: number): string[][] {
  if (length === 1) return arr.map(item => [item]);
  if (length > arr.length) return [];
  
  const result: string[][] = [];
  
  for (let i = 0; i <= arr.length - length; i++) {
    const head = arr[i];
    const tailCombos = getCombinations(arr.slice(i + 1), length - 1);
    for (const combo of tailCombos) {
      result.push([head, ...combo]);
    }
  }
  
  return result;
}

/**
 * Create empty discovery accumulator with tag combinations support
 */
export function createDiscoveryHeatmapAccumulator(
  heatmapDimensions: HeatmapDimensions, 
  maxTagCombinations: number = 2
): DiscoveryHeatmapAccumulator {
  return {
    cellCounts: {
      base: new Map(),
      tags: new Map(),
      tagCombinations: new Map()
    },
    heatmapDimensions: heatmapDimensions,
    collectedTags: new Set(),
    vocabulary: createVocabularyTracker(),
    maxTagCombinations,
    tagCombinationStats: new Map()
  };
}

/**
 * Process a single minimal feature into the discovery accumulator
 */
export function processFeatureIntoDiscoveryCounts(
  feature: MinimalFeature,
  accumulator: DiscoveryHeatmapAccumulator
): void {
  // Get cell position
  const cellId = getCellIdForCoordinates(feature.coordinates, accumulator.heatmapDimensions);
  
  if (!cellId) return; // Feature outside grid bounds
  
  const recordType = feature.recordType;
  
  // Track in vocabulary
  accumulator.vocabulary.recordTypes.add(recordType);
  
  // Initialize base counts for this recordType if needed
  if (!accumulator.cellCounts.base.has(recordType)) {
    accumulator.cellCounts.base.set(recordType, new Map());
  }
  
  // Increment base count
  const baseCounts = accumulator.cellCounts.base.get(recordType)!;
  baseCounts.set(cellId, (baseCounts.get(cellId) || 0) + 1);
  
  // Process tags if they exist
  for (const tag of feature.tags) {
    // Track this tag globally
    accumulator.collectedTags.add(tag);
    accumulator.vocabulary.tags.add(tag);
    
    // Initialize tag structure if needed
    if (!accumulator.cellCounts.tags.has(tag)) {
      accumulator.cellCounts.tags.set(tag, new Map());
    }
    
    const tagCounts = accumulator.cellCounts.tags.get(tag)!;
    if (!tagCounts.has(recordType)) {
      tagCounts.set(recordType, new Map());
    }
    
    // Increment tag count
    const recordTypeTagCounts = tagCounts.get(recordType)!;
    recordTypeTagCounts.set(cellId, (recordTypeTagCounts.get(cellId) || 0) + 1);
  }
  
  // Process tag combinations if feature has multiple tags
  if (feature.tags.length >= 2) {
    const tagCombinations = generateTagCombinations(feature.tags, accumulator.maxTagCombinations);
    
    for (const combination of tagCombinations) {
      const comboKey = combination.sort().join('+'); // e.g., "politics+economy"
      
      // Track combination statistics
      accumulator.tagCombinationStats.set(
        comboKey, 
        (accumulator.tagCombinationStats.get(comboKey) || 0) + 1
      );
      
      // Initialize combination structure if needed
      if (!accumulator.cellCounts.tagCombinations.has(comboKey)) {
        accumulator.cellCounts.tagCombinations.set(comboKey, new Map());
      }
      
      const comboCounts = accumulator.cellCounts.tagCombinations.get(comboKey)!;
      if (!comboCounts.has(recordType)) {
        comboCounts.set(recordType, new Map());
      }
      
      // Increment combination count - this is the TRUE intersection!
      const recordTypeComboCounts = comboCounts.get(recordType)!;
      recordTypeComboCounts.set(cellId, (recordTypeComboCounts.get(cellId) || 0) + 1);
    }
  }
}

/**
 * Stream features and dynamically accumulate counts for multiple resolutions with vocabulary discovery
 */
export async function accumulateCountsWithDiscovery(
  config: DatabaseConfig,
  bounds: HeatmapCellBounds,
  chunkConfig: ChunkingConfig,
  resolutionConfigs: HeatmapResolutionConfig[],
  timeSlice: TimeSlice,
  maxTagCombinations: number = 2
): Promise<{ accumulators: Map<string, DiscoveryHeatmapAccumulator>; globalVocabulary: VocabularyTracker }> {
  
  // Create accumulators for each resolution
  const accumulators = new Map<string, DiscoveryHeatmapAccumulator>();
  let globalVocabulary = createVocabularyTracker();
  
  for (const resConfig of resolutionConfigs) {
    const resolutionKey = `${resConfig.cols}x${resConfig.rows}`;
    const heatmapDimensions: HeatmapDimensions = {
      colsAmount: resConfig.cols,
      rowsAmount: resConfig.rows,
      cellWidth: (bounds.maxLon - bounds.minLon) / resConfig.cols,
      cellHeight: (bounds.maxLat - bounds.minLat) / resConfig.rows,
      minLon: bounds.minLon,
      maxLon: bounds.maxLon,
      minLat: bounds.minLat,
      maxLat: bounds.maxLat
    };
    
    accumulators.set(resolutionKey, createDiscoveryHeatmapAccumulator(heatmapDimensions, maxTagCombinations));
  }
  
  console.log(`🔍 Discovery accumulating counts for period: ${timeSlice.label} across ${resolutionConfigs.length} resolutions`);
  
  // Convert bounds for streaming (legacy format)
  const streamBounds = {
    minLon: bounds.minLon,
    maxLon: bounds.maxLon,
    minLat: bounds.minLat,
    maxLat: bounds.maxLat
  };
  
  // Stream data with discovery - don't filter by recordType
  for await (const result of streamFeaturesWithDiscovery(config, streamBounds, chunkConfig, {
    timeRange: timeSlice.timeRange
    // No recordtypes filter - discover all types
  })) {
    console.log(`📊 Processing ${result.features.length} discovered features from chunk ${result.chunk.id} for period ${timeSlice.label}`);
    
    // Merge chunk vocabulary into global vocabulary
    mergeVocabularies(globalVocabulary, result.vocabulary);
    
    // Process each feature into ALL accumulators
    for (const feature of result.features) {
      for (const [resolutionKey, accumulator] of accumulators) {
        processFeatureIntoDiscoveryCounts(feature, accumulator);
      }
    }
  }
  
  console.log(`✅ Completed discovery accumulation for ${timeSlice.label}`);
  
  return { accumulators, globalVocabulary };
}

/**
 * Generate heatmaps for multiple resolutions and TimeSlices with vocabulary discovery
 */
export async function generateHeatmapResolutionsWithDiscovery(
  config: DatabaseConfig,
  bounds: HeatmapCellBounds,
  chunkConfig: ChunkingConfig,
  resolutionConfigs: HeatmapResolutionConfig[],
  timeSlices: TimeSlice[],
  maxTagCombinations: number = 2
): Promise<{ heatmapResolutions: HeatmapResolutions; globalVocabulary: VocabularyTracker }> {
  
  const result: HeatmapResolutions = {};
  let globalVocabulary = createVocabularyTracker();
  
  // Initialize all resolutions
  for (const resConfig of resolutionConfigs) {
    const resolutionKey = `${resConfig.cols}x${resConfig.rows}`;
    result[resolutionKey] = {};
  }
  
  console.log(`🔍 Generating discovery heatmaps for ${timeSlices.length} time slices and ${resolutionConfigs.length} resolutions`);
  
  for (const timeSlice of timeSlices) {
    console.log(`📅 Discovery processing time slice: ${timeSlice.label} (${timeSlice.timeRange.start} to ${timeSlice.timeRange.end})`);
    
    // Accumulate counts for ALL resolutions simultaneously with discovery
    const { accumulators, globalVocabulary: sliceVocabulary } = await accumulateCountsWithDiscovery(
      config,
      bounds,
      chunkConfig,
      resolutionConfigs,
      timeSlice,
      maxTagCombinations
    );
    
    // Merge slice vocabulary into global vocabulary
    mergeVocabularies(globalVocabulary, sliceVocabulary);
    
    // Generate heatmaps for each resolution from its accumulator
    for (const [resolutionKey, accumulator] of accumulators) {
      // Initialize time slice if not exists
      if (!result[resolutionKey][timeSlice.key]) {
        result[resolutionKey][timeSlice.key] = {} as any;
      }
      
      // Generate heatmaps for each discovered recordType
      for (const recordType of Array.from(accumulator.vocabulary.recordTypes)) {
        // Initialize recordType structure
        result[resolutionKey][timeSlice.key][recordType] = {
          base: generateHeatmap(new Map(), accumulator.heatmapDimensions), // Default empty
          tags: {}
        };
        
        // Generate base heatmap
        const counts = accumulator.cellCounts.base.get(recordType) || new Map();
        result[resolutionKey][timeSlice.key][recordType].base = generateHeatmap(counts, accumulator.heatmapDimensions);
        
        // Generate tag heatmaps using discovered tags
        for (const tag of Array.from(accumulator.vocabulary.tags)) {
          const tagCounts = accumulator.cellCounts.tags.get(tag)?.get(recordType) || new Map();
          result[resolutionKey][timeSlice.key][recordType].tags[tag] = generateHeatmap(tagCounts, accumulator.heatmapDimensions);
        }
        
        // Generate tag combination heatmaps
        for (const [comboKey, comboRecordTypeCounts] of accumulator.cellCounts.tagCombinations) {
          const comboCounts = comboRecordTypeCounts.get(recordType) || new Map();
          
          // Only generate if there are actual features with this combination
          if (comboCounts.size > 0) {
            result[resolutionKey][timeSlice.key][recordType].tags[comboKey] = generateHeatmap(comboCounts, accumulator.heatmapDimensions);
          }
        }
      }
    }
    
    // Log tag combination statistics for this time slice
    for (const [resolutionKey, accumulator] of accumulators) {
      if (accumulator.tagCombinationStats.size > 0) {
        console.log(`📊 Time slice ${timeSlice.key} - Tag combination stats:`, 
          Array.from(accumulator.tagCombinationStats.entries())
            .sort((a, b) => b[1] - a[1]) // Sort by count descending
            .slice(0, 10) // Show top 10
        );
      }
    }
  }
  
  console.log(`✅ Completed discovery heatmap generation for all time slices and resolutions`);
  
  return { heatmapResolutions: result, globalVocabulary };
}

