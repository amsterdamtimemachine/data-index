// src/main.ts - Binary generation for Amsterdam Time Machine

import {
  createTimeSlices,
  generateHeatmapResolutionsWithDiscovery,
} from './visualization/heatmap';
import {
  generateAllHistogramsFromHeatmapTimeline
} from './visualization/histogram';
import {
  createVisualizationBinary,
  generateVisualizationStats
} from './serialization/binaryExport';
import { 
  AMSTERDAM_DATABASE_CONFIG, 
  AMSTERDAM_BOUNDS,
  DEFAULT_GRID_CONFIG,
  DEFAULT_CHUNKING,
} from './config/defaults';

import type { 
  HeatmapDimensions, 
  HeatmapResolutionConfig, 
  TimeSlice,
} from '@atm/shared/types';

async function main() {
  // Configuration - read at runtime to allow test overrides
  const OUTPUT_PATH = process.env.OUTPUT_PATH || './visualization.bin';
  
  console.log('🔍 Starting Amsterdam Time Machine Discovery-Based Binary Generation');
  console.log(`Output path: ${OUTPUT_PATH}`);
  
  const startTime = Date.now();
  
  try {
    const config = {
      database: AMSTERDAM_DATABASE_CONFIG,
      resolutionCanonical: DEFAULT_GRID_CONFIG,
      chunking: DEFAULT_CHUNKING
    };

    console.log(`Resolution: ${config.resolutionCanonical.colsAmount}x${config.resolutionCanonical.rowsAmount}`);
    console.log(`Chunking: ${config.chunking.chunkRows}x${config.chunking.chunkCols} chunks`);

    // Define time periods
    const timeSlices: TimeSlice[] = createTimeSlices([
      { start: 1500, end: 1550 }, 
      { start: 1550, end: 1600 }, 
      { start: 1600, end: 1650 }, 
      { start: 1650, end: 1700 }, 
      { start: 1700, end: 1750 }, 
      { start: 1750, end: 1800 }, 
      { start: 1800, end: 1850 }, 
      { start: 1850, end: 1900 }, 
      { start: 1900, end: 1950 }, 
      { start: 1950, end: 2000 }, 
      { start: 2000, end: 2025 }  
    ]);

    console.log(`Time periods: ${timeSlices.length} (${timeSlices[0].label} to ${timeSlices[timeSlices.length-1].label})`);

    // Calculate bounds with padding
    const padding = config.resolutionCanonical.padding;
    const lonRange = AMSTERDAM_BOUNDS.maxLon - AMSTERDAM_BOUNDS.minLon;
    const latRange = AMSTERDAM_BOUNDS.maxLat - AMSTERDAM_BOUNDS.minLat;
    
    const bounds = {
      minLon: AMSTERDAM_BOUNDS.minLon - (lonRange * padding),
      maxLon: AMSTERDAM_BOUNDS.maxLon + (lonRange * padding),
      minLat: AMSTERDAM_BOUNDS.minLat - (latRange * padding),
      maxLat: AMSTERDAM_BOUNDS.maxLat + (latRange * padding)
    };

    console.log(`Processing bounds: [${bounds.minLon.toFixed(3)}, ${bounds.minLat.toFixed(3)}] to [${bounds.maxLon.toFixed(3)}, ${bounds.maxLat.toFixed(3)}]`);

    // Define resolutions to generate
    const resolutions: HeatmapResolutionConfig[] = [
      { cols: config.resolutionCanonical.colsAmount, rows: config.resolutionCanonical.rowsAmount },
      { cols: 8, rows: 8 },   
      { cols: 16, rows: 16 }, 
    ];
    console.log(`Resolutions: ${resolutions.map(r => `${r.cols}x${r.rows}`).join(', ')}`);

    // Generate heatmap resolutions with discovery and tag combinations
    const maxTagCombinations = 4; // Configuration: limit to 2-tag combinations
    console.log(`\nGenerating heatmap resolutions with discovery (max ${maxTagCombinations} tag combinations)...`);
    const { heatmapResolutions, globalVocabulary } = await generateHeatmapResolutionsWithDiscovery(
      config.database,
      bounds,
      config.chunking,
      resolutions,
      timeSlices,
      maxTagCombinations
    );

    console.log(`Generated ${Object.keys(heatmapResolutions).length} heatmap resolutions`);

    // Extract dynamic recordTypes and tags from vocabulary
    const recordTypes = Array.from(globalVocabulary.recordTypes);
    const tags = Array.from(globalVocabulary.tags);
    
    console.log(`Discovered recordTypes: ${recordTypes.join(', ')}`);
    console.log(`Discovered tags: ${tags.length}`);

    // Generate histograms from heatmap data using discovered recordTypes
    console.log('\nGenerating histograms from heatmap data...');
    const primaryResolutionKey = Object.keys(heatmapResolutions)[0];
    const primaryHeatmapTimeline = heatmapResolutions[primaryResolutionKey];
    
    const histograms = generateAllHistogramsFromHeatmapTimeline(
      primaryHeatmapTimeline,
      timeSlices,
      recordTypes,
      tags.slice(0, 20) // Use top 20 tags
    );

    console.log(`Generated histograms for ${Object.keys(histograms).length} record types`);

    // Generate heatmap metadata
    console.log('\nGenerating heatmap metadata...');
    const primaryResolution = resolutions[0];
    const heatmapDimensions: HeatmapDimensions = {
      colsAmount: primaryResolution.cols,
      rowsAmount: primaryResolution.rows,
      cellWidth: (bounds.maxLon - bounds.minLon) / primaryResolution.cols,
      cellHeight: (bounds.maxLat - bounds.minLat) / primaryResolution.rows,
      minLon: bounds.minLon,
      maxLon: bounds.maxLon,
      minLat: bounds.minLat,
      maxLat: bounds.maxLat
    };

    console.log(`Using grid dimensions: ${heatmapDimensions.colsAmount}x${heatmapDimensions.rowsAmount} (${heatmapDimensions.colsAmount * heatmapDimensions.rowsAmount} cells)`);

    // Generate visualization statistics
    console.log('\nGenerating visualization statistics...');
    const stats = generateVisualizationStats(heatmapResolutions, histograms, timeSlices);
    
    console.log(`Statistics generated:`);
    console.log(`   - Total features: ${stats?.totalFeatures || 0}`);
    console.log(`   - Features per type: ${stats ? Object.entries(stats.featuresPerRecordType).map(([type, count]) => `${type}: ${count}`).join(', ') : 'none'}`);
    console.log(`   - Time slices: ${stats?.timeSliceCount || 0}`);
    console.log(`   - Grid cells: ${stats?.gridCellCount || 0}`);
    console.log(`   - Resolutions: ${stats?.resolutionCount || 0}`);

    // Create visualization binary
    console.log('\nCreating visualization binary...');
    await createVisualizationBinary(
      OUTPUT_PATH,
      heatmapResolutions,
      histograms,
      heatmapDimensions,
      timeSlices,
      recordTypes,
      resolutions,
      tags,
      bounds,
      stats
    );

    // Verify binary file
    const file = Bun.file(OUTPUT_PATH);
    const fileExists = await file.exists();
    const fileSize = fileExists ? file.size : 0;
    
    if (fileExists) {
      console.log(`Binary file created successfully:`);
      console.log(`   - Path: ${OUTPUT_PATH}`);
      console.log(`   - Size: ${(fileSize / (1024 * 1024)).toFixed(2)} MB`);
      console.log(`   - Resolutions: ${Object.keys(heatmapResolutions).length}`);
      console.log(`   - Time periods: ${timeSlices.length}`);
      console.log(`   - Discovered recordTypes: ${recordTypes.length} (${recordTypes.join(', ')})`);
      console.log(`   - Discovered tags: ${tags.length}`);
    } else {
      throw new Error('Binary file was not created successfully');
    }

    const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`\nCompleted in ${totalTime}s`);

  } catch (error) {
    console.error('\nBinary generation failed:', error);
    if (error instanceof Error) {
      console.error('Error details:', error.message);
      console.error('Stack trace:', error.stack);
    }
    process.exit(1);
  }
}

// Export main for programmatic usage
export default main;

// Main execution
if (import.meta.main) {
  main().catch((error) => {
    console.error('Unhandled error:', error);
    process.exit(1);
  });
}
