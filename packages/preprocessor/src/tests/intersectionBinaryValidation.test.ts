// src/tests/intersectionBinaryValidation.test.ts - Validate tag combinations in intersection binary

import { describe, test, expect, beforeAll } from 'bun:test';
import { VisualizationBinaryReader } from '../serialization/binaryExport';
import type { 
  VisualizationMetadata,
  HeatmapResolutions,
  Histograms,
  RecordType,
  TimeSlice,
  HeatmapTimeline
} from '@atm/shared/types';

// Path to intersection binary (different from regular binary)
const INTERSECTION_BINARY_PATH = process.env.OUTPUT_PATH;

interface CompleteVisualizationData {
  metadata: VisualizationMetadata;
  heatmaps: HeatmapResolutions;
  histograms: Histograms;
}

describe('Tag Combinations Binary Validation', () => {
  let data: CompleteVisualizationData;
  let reader: VisualizationBinaryReader;

  beforeAll(async () => {
    console.log(`📖 Loading intersection binary from: ${INTERSECTION_BINARY_PATH}`);
    
    // Check if binary file exists
    if (!INTERSECTION_BINARY_PATH) {
      throw new Error(`INTERSECTION_BINARY_PATH is not set. Please set OUTPUT_PATH environment variable.`);
    }
    
    const file = Bun.file(INTERSECTION_BINARY_PATH);
    const fileExists = await file.exists();
    
    if (!fileExists) {
      throw new Error(
        `Intersection binary file not found at: ${INTERSECTION_BINARY_PATH}\n\n` +
        `Please generate the intersection binary first by running:\n` +
        `  bun run main.ts\n\n` +
        `Make sure you're on the intersection branch and the binary is generated with tag combinations.`
      );
    }
    
    try {
      reader = new VisualizationBinaryReader(INTERSECTION_BINARY_PATH);
      const completeData = await reader.readComplete();
      
      data = {
        metadata: completeData.metadata,
        heatmaps: completeData.heatmaps,
        histograms: completeData.histograms
      };
      
      console.log(`✅ Loaded intersection binary:`, {
        recordTypes: data.metadata.recordTypes,
        tags: data.metadata.tags.length,
        resolutions: Object.keys(data.heatmaps).length,
        timeSlices: data.metadata.timeSlices.length
      });
      
    } catch (error) {
      console.error(`❌ Failed to load intersection binary from ${INTERSECTION_BINARY_PATH}`);
      console.error('Please generate the intersection binary first by running main.ts');
      throw error;
    }
  });

  test('should contain tag combinations in heatmap data', () => {
    const { heatmaps, metadata } = data;
    
    let foundCombinations = 0;
    let totalCombinations = new Set<string>();
    
    // Check each resolution
    for (const [resolutionKey, timeline] of Object.entries(heatmaps)) {
      console.log(`🔍 Checking resolution: ${resolutionKey}`);
      
      // Check each time slice
      for (const [timeSliceKey, timeSliceData] of Object.entries(timeline)) {
        // Check each record type
        for (const [recordType, recordTypeData] of Object.entries(timeSliceData)) {
          // Look for tag combinations (keys with '+' separator)
          for (const tagKey of Object.keys(recordTypeData.tags)) {
            if (tagKey.includes('+')) {
              foundCombinations++;
              totalCombinations.add(tagKey);
              
              const heatmap = recordTypeData.tags[tagKey];
              
              // Validate sparse heatmap structure
              expect(heatmap).toBeDefined();
              expect(heatmap.indices).toBeDefined();
              expect(heatmap.counts).toBeDefined();
              expect(heatmap.densities).toBeDefined();
              expect(heatmap.dimensions).toBeDefined();
              expect(Array.isArray(heatmap.indices)).toBe(true);
              expect(Array.isArray(heatmap.counts)).toBe(true);
              expect(Array.isArray(heatmap.densities)).toBe(true);
              expect(heatmap.counts.length).toBe(heatmap.indices.length);
              expect(heatmap.densities.length).toBe(heatmap.indices.length);

              // Check that combination has some data
              const hasData = heatmap.counts.length > 0;
              if (hasData) {
                console.log(`  ✅ Found combination "${tagKey}" for ${recordType} in ${timeSliceKey} with data`);
              }
            }
          }
        }
      }
    }
    
    console.log(`📊 Tag combination summary:`, {
      totalCombinationInstances: foundCombinations,
      uniqueCombinations: Array.from(totalCombinations).sort(),
      uniqueCount: totalCombinations.size
    });
    
    // Assertions
    expect(foundCombinations).toBeGreaterThan(0);
    expect(totalCombinations.size).toBeGreaterThan(0);
    
    // Verify combinations follow expected format (tag1+tag2)
    for (const combo of totalCombinations) {
      expect(combo).toMatch(/^[^+]+\+[^+]+(\+[^+]+)*$/);
      const parts = combo.split('+');
      expect(parts.length).toBeGreaterThanOrEqual(2);
      expect(parts.length).toBeLessThanOrEqual(3); // Max combinations = 2 means max 2 tags
    }
  });

  test('should have consistent data between individual tags and combinations', () => {
    const { heatmaps } = data;
    let validationPassed = 0;
    let validationFailed = 0;
    
    // Get first resolution for testing
    const firstResolution = Object.keys(heatmaps)[0];
    const timeline = heatmaps[firstResolution];
    
    console.log(`🔍 Validating tag consistency in resolution: ${firstResolution}`);
    
    for (const [timeSliceKey, timeSliceData] of Object.entries(timeline)) {
      for (const [recordType, recordTypeData] of Object.entries(timeSliceData)) {
        const tags = recordTypeData.tags;
        
        // Find all combinations
        const combinations = Object.keys(tags).filter(key => key.includes('+'));
        
        for (const combo of combinations) {
          const comboParts = combo.split('+').sort();
          
          // Check if all individual tags exist
          const individualTagsExist = comboParts.every(tag => tags[tag] !== undefined);
          
          if (individualTagsExist) {
            const comboHeatmap = tags[combo];
            const comboTotal = comboHeatmap.counts.reduce((sum, count) => sum + count, 0);

            // Individual tag totals (sparse format)
            const individualTotals = comboParts.map(tag =>
              tags[tag].counts.reduce((sum, count) => sum + count, 0)
            );
            const minIndividualTotal = Math.min(...individualTotals);
            
            // Combination total should be <= minimum individual total (intersection ≤ individual sets)
            if (comboTotal <= minIndividualTotal) {
              validationPassed++;
            } else {
              validationFailed++;
              console.warn(`⚠️  Combination "${combo}" has more features (${comboTotal}) than minimum individual tag (${minIndividualTotal})`);
            }
          }
        }
      }
    }
    
    console.log(`📊 Consistency validation:`, {
      passed: validationPassed,
      failed: validationFailed,
      successRate: validationPassed / (validationPassed + validationFailed) * 100
    });
    
    expect(validationFailed).toBe(0);
    expect(validationPassed).toBeGreaterThan(0);
  });

  test('should have tag combinations in histogram data as well', () => {
    const { histograms } = data;
    let foundCombinations = 0;
    let totalCombinations = new Set<string>();
    
    // Check each record type
    for (const [recordType, recordTypeData] of Object.entries(histograms)) {
      // Look for tag combinations in tags object
      for (const tagKey of Object.keys(recordTypeData.tags)) {
        if (tagKey.includes('+')) {
          foundCombinations++;
          totalCombinations.add(tagKey);
          
          const histogram = recordTypeData.tags[tagKey];
          
          // Validate histogram structure
          expect(histogram).toBeDefined();
          expect(histogram.bins).toBeDefined();
          expect(Array.isArray(histogram.bins)).toBe(true);
          expect(typeof histogram.totalFeatures).toBe('number');
          expect(typeof histogram.maxCount).toBe('number');
          
          if (histogram.totalFeatures > 0) {
            console.log(`  ✅ Found histogram combination "${tagKey}" for ${recordType} with ${histogram.totalFeatures} features`);
          }
        }
      }
    }
    
    console.log(`📊 Histogram combination summary:`, {
      totalCombinationInstances: foundCombinations,
      uniqueCombinations: Array.from(totalCombinations).sort(),
      uniqueCount: totalCombinations.size
    });
    
    expect(foundCombinations).toBeGreaterThan(0);
    expect(totalCombinations.size).toBeGreaterThan(0);
  });

  test('should log top tag combinations by feature count', () => {
    const { histograms } = data;
    const combinationStats: { combo: string, recordType: string, features: number }[] = [];
    
    // Collect all combination statistics
    for (const [recordType, recordTypeData] of Object.entries(histograms)) {
      for (const [tagKey, histogram] of Object.entries(recordTypeData.tags)) {
        if (tagKey.includes('+')) {
          combinationStats.push({
            combo: tagKey,
            recordType,
            features: histogram.totalFeatures
          });
        }
      }
    }
    
    // Sort by feature count descending
    combinationStats.sort((a, b) => b.features - a.features);
    
    console.log(`📊 Top 10 tag combinations by feature count:`);
    combinationStats.slice(0, 10).forEach((stat, index) => {
      console.log(`  ${index + 1}. ${stat.combo} (${stat.recordType}): ${stat.features} features`);
    });
    
    expect(combinationStats.length).toBeGreaterThan(0);
  });
});
