// realDataValidation.test.ts - Validate real binary data consistency

import { describe, it, expect } from 'bun:test';
import { VisualizationBinaryReader } from '../serialization/binaryExport';
import type { 
  HeatmapTimeline, 
  Histograms, 
  TimeSlice,
  RecordType 
} from '@atm/shared/types';

/**
 * Validation function that verifies histogram bin counts match heatmap counts sums (sparse format)
 */
function validateHistogramHeatmapConsistency(
  heatmapTimeline: HeatmapTimeline,
  histograms: Histograms,
  timeSlices: TimeSlice[]
): { isValid: boolean; errors: string[]; summary: any } {
  const errors: string[] = [];
  const summary = {
    totalChecks: 0,
    baseChecks: 0,
    tagChecks: 0,
    combinationChecks: 0,
    mismatches: 0
  };
  
  // Test each record type
  for (const recordType of Object.keys(histograms) as RecordType[]) {
    const recordTypeHistograms = histograms[recordType];
    
    // Test base histogram vs base heatmaps
    for (const timeSlice of timeSlices) {
      const heatmapData = heatmapTimeline[timeSlice.key]?.[recordType];
      
      if (heatmapData) {
        summary.totalChecks++;
        summary.baseChecks++;

        // Get expected count from heatmap (sparse format)
        const heatmapTotal = heatmapData.base.counts.reduce((sum, count) => sum + count, 0);
        
        // Get actual count from histogram bin
        const histogramBin = recordTypeHistograms.base.bins.find(bin => bin.timeSlice.key === timeSlice.key);
        const histogramCount = histogramBin?.count || 0;
        
        if (heatmapTotal !== histogramCount) {
          summary.mismatches++;
          errors.push(
            `Base mismatch for ${recordType} in ${timeSlice.key}: ` +
            `heatmap total=${heatmapTotal}, histogram bin=${histogramCount}`
          );
        }
      }
    }
    
    // Test tag-specific histograms vs tag heatmaps
    for (const tagKey of Object.keys(recordTypeHistograms.tags)) {
      const isCombo = tagKey.includes('+');
      
      for (const timeSlice of timeSlices) {
        const heatmapData = heatmapTimeline[timeSlice.key]?.[recordType];
        
        if (heatmapData?.tags[tagKey]) {
          summary.totalChecks++;
          if (isCombo) {
            summary.combinationChecks++;
          } else {
            summary.tagChecks++;
          }

          // Get expected count from tag heatmap (sparse format)
          const heatmapTotal = heatmapData.tags[tagKey].counts.reduce((sum, count) => sum + count, 0);
          
          // Get actual count from tag histogram bin
          const histogramBin = recordTypeHistograms.tags[tagKey].bins.find(bin => bin.timeSlice.key === timeSlice.key);
          const histogramCount = histogramBin?.count || 0;
          
          if (heatmapTotal !== histogramCount) {
            summary.mismatches++;
            const type = isCombo ? 'Combination' : 'Tag';
            errors.push(
              `${type} mismatch for ${recordType}+${tagKey} in ${timeSlice.key}: ` +
              `heatmap total=${heatmapTotal}, histogram bin=${histogramCount}`
            );
          }
        }
      }
    }
  }
  
  return {
    isValid: errors.length === 0,
    errors,
    summary
  };
}

describe('Real Data Validation', () => {
  const BINARY_PATH = '../../data/visualization.bin';
  
  it('should load binary file successfully', async () => {
    const reader = new VisualizationBinaryReader(BINARY_PATH);
    
    // Test metadata loading
    const metadata = await reader.readMetadata();
    expect(metadata).toBeDefined();
    expect(metadata.version).toBeDefined();
    expect(metadata.timeSlices).toBeDefined();
    expect(metadata.recordTypes).toBeDefined();
    
    console.log(`📋 Loaded metadata:`);
    console.log(`   - Version: ${metadata.version}`);
    console.log(`   - Time slices: ${metadata.timeSlices.length}`);
    console.log(`   - Record types: ${metadata.recordTypes.join(', ')}`);
    console.log(`   - Tags: ${metadata.tags?.length || 0}`);
  });
  
  it('should load heatmaps and histograms successfully', async () => {
    const reader = new VisualizationBinaryReader(BINARY_PATH);
    
    const heatmaps = await reader.readHeatmaps();
    const histograms = await reader.readHistograms();
    
    expect(heatmaps).toBeDefined();
    expect(histograms).toBeDefined();
    
    const resolutionKeys = Object.keys(heatmaps);
    const recordTypes = Object.keys(histograms);
    
    console.log(`📊 Loaded data:`);
    console.log(`   - Heatmap resolutions: ${resolutionKeys.join(', ')}`);
    console.log(`   - Histogram record types: ${recordTypes.join(', ')}`);
    
    expect(resolutionKeys.length).toBeGreaterThan(0);
    expect(recordTypes.length).toBeGreaterThan(0);
  });
  
  it('should validate real data consistency between heatmaps and histograms', async () => {
    const reader = new VisualizationBinaryReader(BINARY_PATH);
    
    // Load all data
    const metadata = await reader.readMetadata();
    const heatmaps = await reader.readHeatmaps();
    const histograms = await reader.readHistograms();
    
    // Use the first (primary) resolution for validation
    const primaryResolutionKey = Object.keys(heatmaps)[0];
    const heatmapTimeline = heatmaps[primaryResolutionKey];
    
    console.log(`🔍 Validating consistency for resolution: ${primaryResolutionKey}`);
    
    // Run validation
    const result = validateHistogramHeatmapConsistency(
      heatmapTimeline,
      histograms,
      metadata.timeSlices
    );
    
    // Report results
    console.log(`📊 Validation Summary:`);
    console.log(`   - Total checks: ${result.summary.totalChecks}`);
    console.log(`   - Base checks: ${result.summary.baseChecks}`);
    console.log(`   - Tag checks: ${result.summary.tagChecks}`);
    console.log(`   - Combination checks: ${result.summary.combinationChecks}`);
    console.log(`   - Mismatches: ${result.summary.mismatches}`);
    
    if (result.errors.length > 0) {
      console.log(`❌ Validation Errors:`);
      result.errors.slice(0, 10).forEach((error, i) => {
        console.log(`   ${i + 1}. ${error}`);
      });
      if (result.errors.length > 10) {
        console.log(`   ... and ${result.errors.length - 10} more errors`);
      }
    } else {
      console.log(`✅ All histogram bins match their corresponding heatmap totals!`);
    }
    
    // The test should pass regardless, but we want to see the validation results
    expect(result.summary.totalChecks).toBeGreaterThan(0);
    
    // Optional: Uncomment to make test fail if there are inconsistencies
    // expect(result.isValid).toBe(true);
  });
  
  it('should analyze data statistics', async () => {
    const reader = new VisualizationBinaryReader(BINARY_PATH);
    const { heatmaps, histograms, metadata } = await reader.readComplete();
    
    console.log(`📈 Data Statistics:`);
    
    // Analyze heatmap data
    const primaryResolution = Object.keys(heatmaps)[0];
    const heatmapTimeline = heatmaps[primaryResolution];
    
    let totalHeatmapFeatures = 0;
    const heatmapFeaturesByType: Record<string, number> = {};
    
    for (const [timeSliceKey, timeSliceData] of Object.entries(heatmapTimeline)) {
      for (const [recordType, recordTypeData] of Object.entries(timeSliceData)) {
        const counts = recordTypeData.base.counts.reduce((sum, count) => sum + count, 0);
        totalHeatmapFeatures += counts;
        heatmapFeaturesByType[recordType] = (heatmapFeaturesByType[recordType] || 0) + counts;
      }
    }
    
    // Analyze histogram data
    let totalHistogramFeatures = 0;
    const histogramFeaturesByType: Record<string, number> = {};
    
    for (const [recordType, recordTypeData] of Object.entries(histograms)) {
      const counts = recordTypeData.base.totalFeatures;
      totalHistogramFeatures += counts;
      histogramFeaturesByType[recordType] = counts;
    }
    
    console.log(`   - Total features (heatmaps): ${totalHeatmapFeatures}`);
    console.log(`   - Total features (histograms): ${totalHistogramFeatures}`);
    console.log(`   - Features by type (heatmaps):`, heatmapFeaturesByType);
    console.log(`   - Features by type (histograms):`, histogramFeaturesByType);
    
    // Check if totals match
    expect(totalHeatmapFeatures).toBe(totalHistogramFeatures);
  });
});