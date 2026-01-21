// src/tests/dataGeneration.test.ts - Test data generation pipeline end-to-end

import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { existsSync, unlinkSync } from 'fs';
import { resolve } from 'path';
import main from '../main';
import { VisualizationBinaryReader } from '../serialization/binaryExport';
import type { 
  VisualizationMetadata,
  HeatmapResolutions,
  Histograms,
  RecordType
} from '@atm/shared/types';

// Test configuration
const TEST_OUTPUT_PATH = resolve('./test-generation-output.bin');

interface GenerationTestData {
  metadata: VisualizationMetadata;
  heatmaps: HeatmapResolutions;
  histograms: Histograms;
  fileSize: number;
  generationTime: number;
}

describe('Data Generation Pipeline', () => {
  let generatedData: GenerationTestData;

  beforeAll(async () => {
    // Clean up any existing test file
    if (existsSync(TEST_OUTPUT_PATH)) {
      unlinkSync(TEST_OUTPUT_PATH);
    }

    // Set test output path
    process.env.OUTPUT_PATH = TEST_OUTPUT_PATH;

    console.log(`Starting data generation test with output: ${TEST_OUTPUT_PATH}`);
    
    const startTime = Date.now();
    
    try {
      // Run the main generation function
      await main();
      
      const generationTime = Date.now() - startTime;
      
      // Verify file was created
      expect(existsSync(TEST_OUTPUT_PATH)).toBe(true);
      
      // Load the generated data
      const reader = new VisualizationBinaryReader(TEST_OUTPUT_PATH);
      const data = await reader.readComplete();
      
      // Get file size
      const file = Bun.file(TEST_OUTPUT_PATH);
      const fileSize = file.size;
      
      generatedData = {
        metadata: data.metadata,
        heatmaps: data.heatmaps,
        histograms: data.histograms,
        fileSize,
        generationTime
      };
      
      console.log(`Data generation completed in ${generationTime}ms, file size: ${(fileSize / (1024 * 1024)).toFixed(2)}MB`);
      
    } catch (error) {
      throw new Error(`Data generation failed: ${error}`);
    }
  });

  afterAll(() => {
    // Clean up test file
    if (existsSync(TEST_OUTPUT_PATH)) {
      unlinkSync(TEST_OUTPUT_PATH);
    }
  });

  test('binary file is created successfully', () => {
    expect(existsSync(TEST_OUTPUT_PATH)).toBe(true);
    expect(generatedData.fileSize).toBeGreaterThan(0);
    
    console.log(`Generated file size: ${(generatedData.fileSize / (1024 * 1024)).toFixed(2)}MB`);
    console.log(`Generation time: ${(generatedData.generationTime / 1000).toFixed(1)}s`);
  });

  test('metadata structure is complete', () => {
    const metadata = generatedData.metadata;
    
    // Basic metadata fields
    expect(metadata.version).toBeDefined();
    expect(metadata.timestamp).toBeDefined();
    expect(metadata.heatmapDimensions).toBeDefined();
    expect(metadata.heatmapBlueprint).toBeDefined();
    expect(metadata.timeSlices).toBeDefined();
    expect(metadata.recordTypes).toBeDefined();
    expect(metadata.tags).toBeDefined();
    expect(metadata.resolutions).toBeDefined();
    expect(metadata.sections).toBeDefined();
    
    // Arrays should not be empty
    expect(metadata.timeSlices.length).toBeGreaterThan(0);
    expect(metadata.recordTypes.length).toBeGreaterThan(0);
    expect(metadata.tags.length).toBeGreaterThan(0);
    expect(metadata.resolutions.length).toBeGreaterThan(0);
    
    console.log(`Generated metadata: ${metadata.timeSlices.length} time slices, ${metadata.recordTypes.length} record types, ${metadata.tags.length} tags, ${metadata.resolutions.length} resolutions`);
  });

  test('time periods are valid', () => {
    const timeSlices = generatedData.metadata.timeSlices;
    
    // Should have some time periods
    expect(timeSlices.length).toBeGreaterThan(0);
    
    // All time periods should be valid
    for (const timeSlice of timeSlices) {
      expect(timeSlice.startYear).toBeGreaterThan(0);
      expect(timeSlice.endYear).toBeGreaterThan(timeSlice.startYear);
      expect(timeSlice.key).toBeTruthy();
      expect(timeSlice.label).toBeTruthy();
    }
    
    console.log(`Generated ${timeSlices.length} time periods`);
  });

  test('resolutions are valid', () => {
    const resolutions = generatedData.metadata.resolutions;
    const heatmaps = generatedData.heatmaps;
    
    // Should have some resolutions
    expect(resolutions.length).toBeGreaterThan(0);
    
    // All resolutions should be valid and have corresponding data
    for (const resolution of resolutions) {
      expect(resolution.cols).toBeGreaterThan(0);
      expect(resolution.rows).toBeGreaterThan(0);
      
      // Verify heatmap data exists for this resolution
      const resolutionKey = `${resolution.cols}x${resolution.rows}`;
      expect(heatmaps[resolutionKey]).toBeDefined();
    }
    
    console.log(`Generated ${resolutions.length} resolutions`);
  });

  test('record types are discovered and generated', () => {
    const recordTypes = generatedData.metadata.recordTypes;
    const histograms = generatedData.histograms;
    
    // Should have discovered some record types
    expect(recordTypes.length).toBeGreaterThan(0);
    
    // All record types should have corresponding histograms
    for (const recordType of recordTypes) {
      expect(histograms[recordType]).toBeDefined();
      expect(histograms[recordType].base).toBeDefined();
      expect(histograms[recordType].tags).toBeDefined();
    }
    
    console.log(`Discovered record types: ${recordTypes.join(', ')}`);
  });

  test('tags are discovered and generated', () => {
    const tags = generatedData.metadata.tags;
    
    // Should have discovered some tags
    expect(tags.length).toBeGreaterThan(0);
    
    console.log(`Discovered ${tags.length} tags`);
  });

  test('heatmaps contain valid data structure', () => {
    const heatmaps = generatedData.heatmaps;
    const timeSlices = generatedData.metadata.timeSlices;
    const recordTypes = generatedData.metadata.recordTypes;
    
    // Check primary resolution
    const primaryResolutionKey = Object.keys(heatmaps)[0];
    const primaryHeatmap = heatmaps[primaryResolutionKey];
    
    // Each time slice should exist
    for (const timeSlice of timeSlices) {
      expect(primaryHeatmap[timeSlice.key]).toBeDefined();
      
      // Check that at least some recordTypes have data in this time slice
      const timeSliceData = primaryHeatmap[timeSlice.key];
      const recordTypesWithData = Object.keys(timeSliceData);
      expect(recordTypesWithData.length).toBeGreaterThan(0);
      
      // For recordTypes that have data, verify sparse structure
      for (const recordType of recordTypesWithData) {
        const recordTypeData = timeSliceData[recordType as RecordType];
        expect(recordTypeData).toBeDefined();
        expect(recordTypeData.base).toBeDefined();
        expect(recordTypeData.base.indices).toBeDefined();
        expect(recordTypeData.base.counts).toBeDefined();
        expect(recordTypeData.base.densities).toBeDefined();
        expect(recordTypeData.base.dimensions).toBeDefined();
        expect(recordTypeData.tags).toBeDefined();

        // Sparse arrays should have consistent length
        expect(recordTypeData.base.counts.length).toBe(recordTypeData.base.indices.length);
        expect(recordTypeData.base.densities.length).toBe(recordTypeData.base.indices.length);
      }
    }
    
    console.log(`Validated heatmap structure across ${timeSlices.length} time periods`);
  });

  test('histograms contain data for all record types', () => {
    const histograms = generatedData.histograms;
    const recordTypes = generatedData.metadata.recordTypes;
    const timeSlices = generatedData.metadata.timeSlices;
    
    for (const recordType of recordTypes) {
      const recordData = histograms[recordType];
      expect(recordData).toBeDefined();
      expect(recordData.base).toBeDefined();
      expect(recordData.tags).toBeDefined();
      
      // Base histogram should have bins for all time periods
      expect(recordData.base.bins.length).toBe(timeSlices.length);
      
      // Each bin should correspond to a time slice and have valid data
      for (const timeSlice of timeSlices) {
        const bin = recordData.base.bins.find(b => b.timeSlice.key === timeSlice.key);
        expect(bin).toBeDefined();
        expect(bin!.count).toBeGreaterThanOrEqual(0);
        expect(Number.isInteger(bin!.count)).toBe(true);
      }
    }
  });

  test('data contains actual features (not all zeros)', () => {
    const histograms = generatedData.histograms;
    
    // At least one record type should have some features
    let totalFeatures = 0;
    for (const recordData of Object.values(histograms)) {
      totalFeatures += recordData.base.totalFeatures;
    }
    
    expect(totalFeatures).toBeGreaterThan(0);
    
    console.log(`Total features generated: ${totalFeatures.toLocaleString()}`);
  });

  test('vocabulary discovery worked correctly', () => {
    const metadata = generatedData.metadata;
    
    // Should have discovered vocabulary during processing
    expect(metadata.recordTypes.length).toBeGreaterThan(0);
    expect(metadata.tags.length).toBeGreaterThan(0);
    
    // Record types should be realistic values (not empty strings, etc.)
    for (const recordType of metadata.recordTypes) {
      expect(recordType).toBeTruthy();
      expect(typeof recordType).toBe('string');
      expect(recordType.length).toBeGreaterThan(0);
    }
    
    // Tags should be realistic values
    for (const tag of metadata.tags) {
      expect(tag).toBeTruthy();
      expect(typeof tag).toBe('string');
      expect(tag.length).toBeGreaterThan(0);
    }
  });

  test('binary sections are properly structured', () => {
    const sections = generatedData.metadata.sections;
    
    // Should have both required sections
    expect(sections.heatmaps).toBeDefined();
    expect(sections.histograms).toBeDefined();
    
    // Offsets and lengths should be positive
    expect(sections.heatmaps.offset).toBeGreaterThanOrEqual(0);
    expect(sections.heatmaps.length).toBeGreaterThan(0);
    expect(sections.histograms.offset).toBeGreaterThanOrEqual(0);
    expect(sections.histograms.length).toBeGreaterThan(0);
    
    // Histograms should come after heatmaps
    expect(sections.histograms.offset).toBeGreaterThanOrEqual(sections.heatmaps.length);
  });

  test('statistics are calculated correctly', () => {
    const stats = generatedData.metadata.stats;
    
    if (stats) {
      expect(stats.totalFeatures).toBeGreaterThan(0);
      expect(stats.timeSliceCount).toBe(generatedData.metadata.timeSlices.length);
      expect(stats.resolutionCount).toBe(generatedData.metadata.resolutions.length);
      expect(stats.gridCellCount).toBeGreaterThan(0);
      
      // Features per record type should sum to total
      let sumPerType = 0;
      for (const count of Object.values(stats.featuresPerRecordType)) {
        expect(count).toBeGreaterThanOrEqual(0);
        sumPerType += count;
      }
      expect(sumPerType).toBe(stats.totalFeatures);
    }
  });

});