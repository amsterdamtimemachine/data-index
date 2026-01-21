// src/tests/binaryDataValidation.test.ts - Validate generated binary data consistency

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

// Use path from environment (required)
const OUTPUT_PATH = process.env.OUTPUT_PATH;

interface CompleteVisualizationData {
  metadata: VisualizationMetadata;
  heatmaps: HeatmapResolutions;
  histograms: Histograms;
}

interface ValidationResult {
  passed: boolean;
  errors: string[];
  warnings: string[];
  summary: {
    totalChecks: number;
    passedChecks: number;
    failedChecks: number;
  };
}

class BinaryValidator {
  private data: CompleteVisualizationData;

  constructor(data: CompleteVisualizationData) {
    this.data = data;
  }

  /**
   * Main validation entry point
   */
  validateConsistency(): ValidationResult {
    const result: ValidationResult = {
      passed: true,
      errors: [],
      warnings: [],
      summary: { totalChecks: 0, passedChecks: 0, failedChecks: 0 }
    };

    // Run all validation checks
    this.validateBinaryStructure(result);
    this.validateMetadataAccuracy(result);
    this.validateHeatmapHistogramConsistency(result);
    this.validateCrossResolutionConsistency(result);
    this.validateDataCompleteness(result);

    // Update summary
    result.passed = result.errors.length === 0;
    result.summary.failedChecks = result.errors.length;
    result.summary.passedChecks = result.summary.totalChecks - result.summary.failedChecks;

    return result;
  }

  private validateBinaryStructure(result: ValidationResult): void {
    result.summary.totalChecks += 4;

    // Check metadata exists
    if (!this.data.metadata) {
      result.errors.push('Missing metadata section');
      return;
    }

    // Check heatmaps exist
    if (!this.data.heatmaps || Object.keys(this.data.heatmaps).length === 0) {
      result.errors.push('Missing or empty heatmaps section');
      return;
    }

    // Check histograms exist
    if (!this.data.histograms || Object.keys(this.data.histograms).length === 0) {
      result.errors.push('Missing or empty histograms section');
      return;
    }

    // Check expected sections match
    const expectedRecordTypes = this.data.metadata.recordTypes;
    const histogramRecordTypes = Object.keys(this.data.histograms);
    
    if (expectedRecordTypes.length !== histogramRecordTypes.length) {
      result.errors.push(`Metadata recordTypes (${expectedRecordTypes.length}) doesn't match histogram recordTypes (${histogramRecordTypes.length})`);
    }
  }

  private validateMetadataAccuracy(result: ValidationResult): void {
    result.summary.totalChecks += 3;

    const metadata = this.data.metadata;
    
    // Calculate actual total features from histograms
    let actualTotalFeatures = 0;
    const actualFeaturesPerRecordType: Record<string, number> = {};

    for (const [recordType, recordData] of Object.entries(this.data.histograms)) {
      const recordTypeTotal = recordData.base.totalFeatures;
      actualTotalFeatures += recordTypeTotal;
      actualFeaturesPerRecordType[recordType] = recordTypeTotal;
    }

    // Validate total features
    if (metadata.stats?.totalFeatures !== actualTotalFeatures) {
      result.errors.push(`Metadata totalFeatures (${metadata.stats?.totalFeatures}) doesn't match calculated total (${actualTotalFeatures})`);
    }

    // Validate features per record type
    for (const recordType of metadata.recordTypes) {
      const expectedCount = metadata.stats?.featuresPerRecordType[recordType as RecordType];
      const actualCount = actualFeaturesPerRecordType[recordType];
      
      if (expectedCount !== actualCount) {
        result.errors.push(`Metadata featuresPerRecordType[${recordType}] (${expectedCount}) doesn't match calculated (${actualCount})`);
      }
    }

    // Validate time slice count
    const actualTimeSliceCount = metadata.timeSlices.length;
    if (metadata.stats?.timeSliceCount !== actualTimeSliceCount) {
      result.errors.push(`Metadata timeSliceCount (${metadata.stats?.timeSliceCount}) doesn't match actual (${actualTimeSliceCount})`);
    }
  }

  private validateHeatmapHistogramConsistency(result: ValidationResult): void {
    const primaryResolutionKey = Object.keys(this.data.heatmaps)[0];
    const primaryHeatmapTimeline = this.data.heatmaps[primaryResolutionKey];

    for (const recordType of this.data.metadata.recordTypes) {
      result.summary.totalChecks += 1 + this.data.metadata.tags.length;

      // Validate base histogram consistency
      this.validateRecordTypeBaseConsistency(
        recordType as RecordType, 
        primaryHeatmapTimeline, 
        result
      );

      // Validate tag histogram consistency
      for (const tag of this.data.metadata.tags) {
        this.validateRecordTypeTagConsistency(
          recordType as RecordType,
          tag,
          primaryHeatmapTimeline,
          result
        );
      }
    }
  }

  private validateRecordTypeBaseConsistency(
    recordType: RecordType,
    heatmapTimeline: HeatmapTimeline,
    result: ValidationResult
  ): void {
    const histogramData = this.data.histograms[recordType];
    if (!histogramData) {
      result.errors.push(`Missing histogram data for recordType: ${recordType}`);
      return;
    }

    const baseHistogram = histogramData.base;

    // For each time slice, verify heatmap totals match histogram bins
    for (const timeSlice of this.data.metadata.timeSlices) {
      const timeSliceData = heatmapTimeline[timeSlice.key];
      const histogramBin = baseHistogram.bins.find(bin => bin.timeSlice.key === timeSlice.key);

      if (!timeSliceData || !timeSliceData[recordType]) {
        if (histogramBin && histogramBin.count > 0) {
          result.errors.push(`Missing heatmap data for ${recordType} in ${timeSlice.key}, but histogram has ${histogramBin.count} features`);
        }
        continue;
      }

      if (!histogramBin) {
        result.errors.push(`Missing histogram bin for ${recordType} in ${timeSlice.key}`);
        continue;
      }

      // Sum heatmap counts (sparse format)
      const heatmapTotal = timeSliceData[recordType].base.counts.reduce(
        (sum: number, count: number) => sum + count, 0
      );

      if (heatmapTotal !== histogramBin.count) {
        result.errors.push(
          `${recordType} ${timeSlice.key}: heatmap total (${heatmapTotal}) ≠ histogram bin (${histogramBin.count})`
        );
      }
    }

    // Validate histogram totalFeatures matches sum of bins
    const calculatedTotal = baseHistogram.bins.reduce((sum, bin) => sum + bin.count, 0);
    if (baseHistogram.totalFeatures !== calculatedTotal) {
      result.errors.push(
        `${recordType} base histogram: totalFeatures (${baseHistogram.totalFeatures}) ≠ sum of bins (${calculatedTotal})`
      );
    }
  }

  private validateRecordTypeTagConsistency(
    recordType: RecordType,
    tag: string,
    heatmapTimeline: HeatmapTimeline,
    result: ValidationResult
  ): void {
    const histogramData = this.data.histograms[recordType];
    if (!histogramData || !histogramData.tags[tag]) {
      // Tag histogram might not exist if no features have this tag
      return;
    }

    const tagHistogram = histogramData.tags[tag];

    // For each time slice, verify tag heatmap totals match tag histogram bins
    for (const timeSlice of this.data.metadata.timeSlices) {
      const timeSliceData = heatmapTimeline[timeSlice.key];
      const histogramBin = tagHistogram.bins.find(bin => bin.timeSlice.key === timeSlice.key);

      if (!timeSliceData || !timeSliceData[recordType] || !timeSliceData[recordType].tags[tag]) {
        if (histogramBin && histogramBin.count > 0) {
          result.errors.push(`Missing tag heatmap data for ${recordType}+${tag} in ${timeSlice.key}, but histogram has ${histogramBin.count} features`);
        }
        continue;
      }

      if (!histogramBin) {
        result.errors.push(`Missing tag histogram bin for ${recordType}+${tag} in ${timeSlice.key}`);
        continue;
      }

      // Sum tag heatmap counts (sparse format)
      const heatmapTotal = timeSliceData[recordType].tags[tag].counts.reduce(
        (sum: number, count: number) => sum + count, 0
      );

      if (heatmapTotal !== histogramBin.count) {
        result.errors.push(
          `${recordType}+${tag} ${timeSlice.key}: heatmap total (${heatmapTotal}) ≠ histogram bin (${histogramBin.count})`
        );
      }
    }
  }

  private validateCrossResolutionConsistency(result: ValidationResult): void {
    const resolutionKeys = Object.keys(this.data.heatmaps);
    if (resolutionKeys.length < 2) {
      result.warnings.push('Only one resolution found, skipping cross-resolution validation');
      return;
    }

    result.summary.totalChecks += resolutionKeys.length - 1;

    const baseResolution = this.data.heatmaps[resolutionKeys[0]];

    // For each additional resolution, verify temporal totals match
    for (let i = 1; i < resolutionKeys.length; i++) {
      const compareResolution = this.data.heatmaps[resolutionKeys[i]];

      for (const timeSlice of this.data.metadata.timeSlices) {
        for (const recordType of this.data.metadata.recordTypes) {
          const baseTotal = this.calculateHeatmapTotal(
            baseResolution[timeSlice.key]?.[recordType as RecordType]?.base
          );
          const compareTotal = this.calculateHeatmapTotal(
            compareResolution[timeSlice.key]?.[recordType as RecordType]?.base
          );

          if (baseTotal !== compareTotal) {
            result.errors.push(
              `Resolution ${resolutionKeys[0]} vs ${resolutionKeys[i]}: ${recordType} ${timeSlice.key} totals don't match (${baseTotal} ≠ ${compareTotal})`
            );
          }
        }
      }
    }
  }

  private validateDataCompleteness(result: ValidationResult): void {
    result.summary.totalChecks += 2;

    // Check all declared recordTypes have data
    for (const recordType of this.data.metadata.recordTypes) {
      if (!this.data.histograms[recordType]) {
        result.errors.push(`Missing histogram data for declared recordType: ${recordType}`);
      }
    }

    // Check all time slices have data
    const primaryResolution = Object.values(this.data.heatmaps)[0];
    for (const timeSlice of this.data.metadata.timeSlices) {
      if (!primaryResolution[timeSlice.key]) {
        result.warnings.push(`No heatmap data found for time slice: ${timeSlice.key}`);
      }
    }
  }

  private calculateHeatmapTotal(heatmap: any): number {
    if (!heatmap || !heatmap.counts) return 0;
    return heatmap.counts.reduce((sum: number, count: number) => sum + count, 0);
  }
}

// Test Suite
describe('Binary Data Validation', () => {
  let testData: CompleteVisualizationData;
  let validator: BinaryValidator;

  beforeAll(async () => {
    console.log(`Loading binary from: ${OUTPUT_PATH}`);
    
    // Check if binary file exists
    if (!OUTPUT_PATH) {
      throw new Error(`OUTPUT_PATH environment variable is not set. Please run with environment variables.`);
    }
    
    const file = Bun.file(OUTPUT_PATH);
    const fileExists = await file.exists();
    
    if (!fileExists) {
      throw new Error(
        `Binary file not found at: ${OUTPUT_PATH}\n\n` +
        `Please generate the binary file first by running:\n` +
        `  bun run generate\n\n` +
        `Or run the complete validation pipeline:\n` +
        `  bun run validate`
      );
    }
    
    try {
      const reader = new VisualizationBinaryReader(OUTPUT_PATH);
      const data = await reader.readComplete();
      
      testData = {
        metadata: data.metadata,
        heatmaps: data.heatmaps,
        histograms: data.histograms
      };
      
      validator = new BinaryValidator(testData);
      
      console.log(`Loaded binary with ${Object.keys(testData.heatmaps).length} resolutions, ${Object.keys(testData.histograms).length} record types`);
    } catch (error) {
      if (error instanceof Error && error.message.includes('not found')) {
        throw new Error(
          `Binary file exists but could not be loaded: ${OUTPUT_PATH}\n\n` +
          `The file might be corrupted or from an incompatible version.\n` +
          `Try regenerating it with:\n` +
          `  bun run generate`
        );
      }
      throw new Error(`Failed to load binary file: ${error}`);
    }
  });

  test('binary file loads successfully', async () => {
    expect(testData).toBeDefined();
    expect(testData.metadata).toBeDefined();
    expect(testData.heatmaps).toBeDefined();
    expect(testData.histograms).toBeDefined();
  });

  test('binary structure is valid', () => {
    const result = validator.validateConsistency();
    
    // Log results for debugging
    if (result.errors.length > 0) {
      console.error('Validation Errors:');
      result.errors.forEach(error => console.error(`  ❌ ${error}`));
    }
    
    if (result.warnings.length > 0) {
      console.warn('Validation Warnings:');
      result.warnings.forEach(warning => console.warn(`  ⚠️ ${warning}`));
    }
    
    console.log(`Validation Summary: ${result.summary.passedChecks}/${result.summary.totalChecks} checks passed`);
    
    expect(result.passed).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  test('heatmap and histogram data consistency', () => {
    // This is covered by the main validation, but we can add specific spot checks
    const primaryResolution = Object.values(testData.heatmaps)[0];
    const firstTimeSlice = testData.metadata.timeSlices[0];
    const firstRecordType = testData.metadata.recordTypes[0] as RecordType;
    
    const heatmapData = primaryResolution[firstTimeSlice.key]?.[firstRecordType];
    const histogramData = testData.histograms[firstRecordType];
    
    if (heatmapData && histogramData) {
      const heatmapTotal = heatmapData.base.counts.reduce(
        (sum: number, count: number) => sum + count, 0
      );
      
      const histogramBin = histogramData.base.bins.find(
        bin => bin.timeSlice.key === firstTimeSlice.key
      );
      
      expect(histogramBin).toBeDefined();
      expect(heatmapTotal).toBe(histogramBin!.count);
    }
  });

  test('metadata accuracy', () => {
    // Verify metadata stats match actual computed values
    let actualTotalFeatures = 0;
    
    for (const recordData of Object.values(testData.histograms)) {
      actualTotalFeatures += recordData.base.totalFeatures;
    }
    
    expect(testData.metadata.stats?.totalFeatures).toBe(actualTotalFeatures);
    expect(testData.metadata.stats?.timeSliceCount).toBe(testData.metadata.timeSlices.length);
  });

  test('data value ranges and statistical consistency', () => {
    // Test histogram maxCount accuracy
    for (const [recordType, recordData] of Object.entries(testData.histograms)) {
      const actualMaxCount = Math.max(...recordData.base.bins.map(bin => bin.count));
      expect(recordData.base.maxCount).toBe(actualMaxCount);
      
      // Test tag histogram maxCount too
      for (const [tag, tagHistogram] of Object.entries(recordData.tags)) {
        const tagMaxCount = Math.max(...tagHistogram.bins.map(bin => bin.count));
        expect(tagHistogram.maxCount).toBe(tagMaxCount);
      }
    }

    // Test that all counts are non-negative (sparse format)
    const primaryResolution = Object.values(testData.heatmaps)[0];
    for (const timeSliceData of Object.values(primaryResolution)) {
      for (const recordTypeData of Object.values(timeSliceData)) {
        // Check base heatmap (sparse structure)
        expect(recordTypeData.base.indices).toBeDefined();
        expect(recordTypeData.base.counts).toBeDefined();
        expect(recordTypeData.base.densities).toBeDefined();
        expect(recordTypeData.base.dimensions).toBeDefined();

        // All sparse arrays should have same length
        expect(recordTypeData.base.counts.length).toBe(recordTypeData.base.indices.length);
        expect(recordTypeData.base.densities.length).toBe(recordTypeData.base.indices.length);

        for (const count of recordTypeData.base.counts) {
          expect(count).toBeGreaterThanOrEqual(0);
        }

        // Check density values are in valid range [0, 1]
        for (const density of recordTypeData.base.densities) {
          expect(density).toBeGreaterThanOrEqual(0);
          expect(density).toBeLessThanOrEqual(1);
        }

        // Check tag heatmaps (sparse structure)
        for (const tagData of Object.values(recordTypeData.tags)) {
          expect(tagData.indices).toBeDefined();
          expect(tagData.counts).toBeDefined();
          expect(tagData.densities).toBeDefined();
          expect(tagData.counts.length).toBe(tagData.indices.length);
          expect(tagData.densities.length).toBe(tagData.indices.length);

          for (const count of tagData.counts) {
            expect(count).toBeGreaterThanOrEqual(0);
          }
          for (const density of tagData.densities) {
            expect(density).toBeGreaterThanOrEqual(0);
            expect(density).toBeLessThanOrEqual(1);
          }
        }
      }
    }
  });

  test('time series chronological order', () => {
    // Verify time slices are chronologically ordered
    for (let i = 1; i < testData.metadata.timeSlices.length; i++) {
      const prevSlice = testData.metadata.timeSlices[i-1];
      const currentSlice = testData.metadata.timeSlices[i];
      
      expect(currentSlice.startYear).toBeGreaterThanOrEqual(prevSlice.startYear);
    }

    // Verify histogram time ranges match first/last slices
    for (const recordData of Object.values(testData.histograms)) {
      const firstSlice = testData.metadata.timeSlices[0];
      const lastSlice = testData.metadata.timeSlices[testData.metadata.timeSlices.length - 1];
      
      expect(recordData.base.timeRange.start).toBe(firstSlice.timeRange.start);
      expect(recordData.base.timeRange.end).toBe(lastSlice.timeRange.end);
    }
  });
});