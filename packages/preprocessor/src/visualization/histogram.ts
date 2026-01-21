// src/visualization/histogram.ts - Updated histogram generation with flattened structure

import type { 
  TimeSlice,
  RecordType, 
  HeatmapTimeline,
  HistogramBin,
  Histogram,
  Histograms
} from '@atm/shared/types';

/**
 * Create empty histogram bin for a time period
 */
export function createEmptyHistogramBin(timeSlice: TimeSlice): HistogramBin {
  return {
    timeSlice,
    count: 0
  };
}

/**
 * Helper function to create empty histogram structure with proper bins
 */
function createEmptyHistogramStructure(timeSlices: TimeSlice[]): Histogram {
  const bins = timeSlices
    .sort((a, b) => a.startYear - b.startYear)
    .map(timeSlice => createEmptyHistogramBin(timeSlice));
  
  const timeRange = timeSlices.length > 0 ? {
    start: timeSlices[0].timeRange.start,
    end: timeSlices[timeSlices.length - 1].timeRange.end
  } : { start: '', end: '' };
  
  return {
    bins,
    maxCount: 0,
    timeRange,
    totalFeatures: 0
  };
}

/**
 * Generate all histograms from HeatmapTimeline data (for preprocessor binary generation)
 * This converts spatial heatmap data into temporal histogram data for all recordTypes and tags
 */
export function generateAllHistogramsFromHeatmapTimeline(
  heatmapTimeline: HeatmapTimeline,
  timeSlices: TimeSlice[],
  recordTypes: RecordType[],
  tags: string[]
): Histograms {
  
  console.log(`📊 Generating all histograms from HeatmapTimeline data`);
  console.log(`   - Time slices: ${timeSlices.length}`);
  console.log(`   - Record types: ${recordTypes.length} (${recordTypes.join(', ')})`);
  console.log(`   - Tags: ${tags.length}`);
  
  const histograms: Histograms = {};
  
  // Generate histograms for each record type
  for (const recordType of recordTypes) {
    console.log(`📈 Processing histograms for recordType: ${recordType}`);
    
    // Initialize structure for this record type
    histograms[recordType] = {
      base: createEmptyHistogramStructure(timeSlices),
      tags: {}
    };
    
    // Process base histogram (all data for this recordType)
    for (const timeSlice of timeSlices) {
      const timeSliceData = heatmapTimeline[timeSlice.key];
      let totalCount = 0;
      
      if (timeSliceData && timeSliceData[recordType]) {
        const recordTypeData = timeSliceData[recordType];
        
        // Sum up all counts from the base heatmap (sparse format)
        if (recordTypeData.base && recordTypeData.base.counts) {
          totalCount = recordTypeData.base.counts.reduce(
            (sum: number, count: number) => sum + count, 0
          );
        }
      }
      
      // Find the bin for this time slice and update count
      const bin = histograms[recordType].base.bins.find(
        (b: HistogramBin) => b.timeSlice.key === timeSlice.key
      );
      if (bin) {
        bin.count = totalCount;
      }
    }
    
    // Calculate base histogram metadata
    const baseBins = histograms[recordType].base.bins;
    histograms[recordType].base.maxCount = Math.max(...baseBins.map((b: HistogramBin) => b.count), 0);
    histograms[recordType].base.totalFeatures = baseBins.reduce((sum: number, b: HistogramBin) => sum + b.count, 0);
    
    // Process tag-specific histograms
    for (const tag of tags) {
      histograms[recordType].tags[tag] = createEmptyHistogramStructure(timeSlices);
      
      for (const timeSlice of timeSlices) {
        const timeSliceData = heatmapTimeline[timeSlice.key];
        let totalCount = 0;
        
        if (timeSliceData && timeSliceData[recordType] && timeSliceData[recordType].tags[tag]) {
          const tagData = timeSliceData[recordType].tags[tag];
          
          // Sum up all counts from the tag-specific heatmap (sparse format)
          if (tagData.counts) {
            totalCount = tagData.counts.reduce(
              (sum: number, count: number) => sum + count, 0
            );
          }
        }
        
        // Find the bin for this time slice and update count
        const bin = histograms[recordType].tags[tag].bins.find(
          (b: HistogramBin) => b.timeSlice.key === timeSlice.key
        );
        if (bin) {
          bin.count = totalCount;
        }
      }
      
      // Calculate tag histogram metadata
      const tagBins = histograms[recordType].tags[tag].bins;
      histograms[recordType].tags[tag].maxCount = Math.max(...tagBins.map((b: HistogramBin) => b.count), 0);
      histograms[recordType].tags[tag].totalFeatures = tagBins.reduce((sum: number, b: HistogramBin) => sum + b.count, 0);
    }
    
    // Process tag combinations (keys with '+' separator)
    let combinationCount = 0;
    for (const timeSlice of timeSlices) {
      const timeSliceData = heatmapTimeline[timeSlice.key];
      
      if (timeSliceData && timeSliceData[recordType] && timeSliceData[recordType].tags) {
        const allTagKeys = Object.keys(timeSliceData[recordType].tags);
        const combinationKeys = allTagKeys.filter(key => key.includes('+'));
        
        for (const comboKey of combinationKeys) {
          // Initialize combination histogram if not exists
          if (!histograms[recordType].tags[comboKey]) {
            histograms[recordType].tags[comboKey] = createEmptyHistogramStructure(timeSlices);
            combinationCount++;
          }
          
          const comboData = timeSliceData[recordType].tags[comboKey];
          let totalCount = 0;
          
          // Sum up all counts from the combination heatmap (sparse format)
          if (comboData && comboData.counts) {
            totalCount = comboData.counts.reduce(
              (sum: number, count: number) => sum + count, 0
            );
          }
          
          // Find the bin for this time slice and update count
          const bin = histograms[recordType].tags[comboKey].bins.find(
            (b: HistogramBin) => b.timeSlice.key === timeSlice.key
          );
          if (bin) {
            bin.count = totalCount;
          }
        }
      }
    }
    
    // Calculate metadata for all tag combinations
    const allCombinations = Object.keys(histograms[recordType].tags).filter(key => key.includes('+'));
    for (const comboKey of allCombinations) {
      const comboBins = histograms[recordType].tags[comboKey].bins;
      histograms[recordType].tags[comboKey].maxCount = Math.max(...comboBins.map((b: HistogramBin) => b.count), 0);
      histograms[recordType].tags[comboKey].totalFeatures = comboBins.reduce((sum: number, b: HistogramBin) => sum + b.count, 0);
    }
    
    console.log(`✅ Generated histograms for ${recordType}: base (${histograms[recordType].base.totalFeatures} features), ${tags.length} individual tags, ${combinationCount} combinations`);
  }
  
  console.log(`✅ Generated complete histogram collection for ${recordTypes.length} recordTypes and ${tags.length} tags`);
  return histograms;
}
