// src/serialization/visualization.ts - Binary serialization for visualization data

import { encode, decode } from '@msgpack/msgpack';
import type {
  RecordType,
  VisualizationMetadata,
  VisualizationData,
  HeatmapTimeline,
  HeatmapResolutions,
  HeatmapDimensions,
  HeatmapResolutionConfig,
  Heatmap,
  Histogram,
  Histograms,
  TimeSlice,
  HeatmapIndex,
  HistogramIndex,
  SectionIndex
} from '@atm/shared/types';

export class VisualizationBinaryWriter {
  private writer: any;
  private currentOffset: number = 0;
  private sections: VisualizationMetadata['sections'] = {
    heatmaps: { offset: 0, length: 0, index: {} },
    histograms: { offset: 0, length: 0, index: {} }
  };

  constructor(private binaryPath: string) {}

  /**
   * Initialize the binary file and reserve space for metadata
   */
  async initialize(): Promise<void> {
    this.writer = Bun.file(this.binaryPath).writer();
    
    // Reserve 4 bytes for metadata size (will be written at the end)
    const placeholderSize = Buffer.allocUnsafe(4);
    placeholderSize.writeUInt32BE(0, 0);
    this.writer.write(placeholderSize);
    this.currentOffset += 4;
    
    console.log(`📝 Initialized visualization binary writer for ${this.binaryPath}`);
  }

  /**
   * Write heatmaps data to the binary file with granular indexing
   * Each heatmap (resolution/timeSlice/recordType/tag) is written as a separate msgpack section
   */
  async writeHeatmaps(heatmapResolutions: HeatmapResolutions): Promise<void> {
    console.log(`🔥 Writing heatmaps data with granular indexing...`);

    const heatmapsStartOffset = this.currentOffset;
    const index: HeatmapIndex = {};
    let sectionCount = 0;

    for (const [resKey, timeline] of Object.entries(heatmapResolutions)) {
      index[resKey] = {};

      for (const [tsKey, recordTypes] of Object.entries(timeline)) {
        index[resKey][tsKey] = {};

        for (const [rtKey, data] of Object.entries(recordTypes)) {
          // Write base heatmap as individual msgpack section
          const baseEncoded = encode(data.base);
          const baseOffset = this.currentOffset - heatmapsStartOffset;
          this.writer.write(baseEncoded);
          this.currentOffset += baseEncoded.byteLength;
          sectionCount++;

          index[resKey][tsKey][rtKey] = {
            base: { offset: baseOffset, length: baseEncoded.byteLength },
            tags: {}
          };

          // Write each tag heatmap as individual msgpack section
          for (const [tagKey, heatmap] of Object.entries(data.tags)) {
            const tagEncoded = encode(heatmap);
            const tagOffset = this.currentOffset - heatmapsStartOffset;
            this.writer.write(tagEncoded);
            this.currentOffset += tagEncoded.byteLength;
            sectionCount++;

            index[resKey][tsKey][rtKey].tags[tagKey] = {
              offset: tagOffset,
              length: tagEncoded.byteLength
            };
          }
        }
      }
    }

    const totalLength = this.currentOffset - heatmapsStartOffset;
    this.sections.heatmaps = {
      offset: 0, // First data section
      length: totalLength,
      index
    };

    console.log(`✅ Heatmaps written: ${sectionCount} sections, ${totalLength} bytes total`);
  }

  /**
   * Write histograms data to the binary file with granular indexing
   * Each histogram (recordType/base and recordType/tag) is written as a separate msgpack section
   */
  async writeHistograms(histograms: Histograms): Promise<void> {
    console.log(`📊 Writing histograms data with granular indexing...`);

    const histogramsStartOffset = this.currentOffset;
    const index: HistogramIndex = {};
    let sectionCount = 0;

    for (const [recordType, data] of Object.entries(histograms)) {
      // Write base histogram as individual msgpack section
      const baseEncoded = encode(data.base);
      const baseOffset = this.currentOffset - histogramsStartOffset;
      this.writer.write(baseEncoded);
      this.currentOffset += baseEncoded.byteLength;
      sectionCount++;

      index[recordType] = {
        base: { offset: baseOffset, length: baseEncoded.byteLength },
        tags: {}
      };

      // Write each tag histogram as individual msgpack section
      for (const [tagKey, histogram] of Object.entries(data.tags)) {
        const tagEncoded = encode(histogram);
        const tagOffset = this.currentOffset - histogramsStartOffset;
        this.writer.write(tagEncoded);
        this.currentOffset += tagEncoded.byteLength;
        sectionCount++;

        index[recordType].tags[tagKey] = {
          offset: tagOffset,
          length: tagEncoded.byteLength
        };
      }
    }

    const totalLength = this.currentOffset - histogramsStartOffset;
    this.sections.histograms = {
      offset: this.sections.heatmaps.length, // After heatmaps section
      length: totalLength,
      index
    };

    console.log(`✅ Histograms written: ${sectionCount} sections, ${totalLength} bytes total`);
  }

  /**
   * Finalize with enhanced metadata including TimeSlices
   */
  async finalize(
    heatmapDimensions: HeatmapDimensions,
    timeSlices: TimeSlice[],
    recordTypes: RecordType[],
    resolutions: HeatmapResolutionConfig[],
    tags: string[],
    bounds: { minLon: number; maxLon: number; minLat: number; maxLat: number },
    stats?: VisualizationMetadata['stats']
  ): Promise<void> {
    console.log(`📋 Finalizing visualization binary...`);
    
    // Calculate overall time range from TimeSlices
    const timeRange = timeSlices.length > 0 ? {
      start: timeSlices[0].timeRange.start,
      end: timeSlices[timeSlices.length - 1].timeRange.end
    } : { start: '', end: '' };
    
    // Generate dimensions for all resolutions
    const resolutionDimensions: Record<string, HeatmapDimensions> = {};
    for (const resolution of resolutions) {
      const resolutionKey = `${resolution.cols}x${resolution.rows}`;
      resolutionDimensions[resolutionKey] = {
        colsAmount: resolution.cols,
        rowsAmount: resolution.rows,
        cellWidth: (bounds.maxLon - bounds.minLon) / resolution.cols,
        cellHeight: (bounds.maxLat - bounds.minLat) / resolution.rows,
        minLon: bounds.minLon,
        maxLon: bounds.maxLon,
        minLat: bounds.minLat,
        maxLat: bounds.maxLat
      };
    }
    
    // Create metadata
    const metadata: VisualizationMetadata = {
      version: '5.0.0', // v5: removed heatmapBlueprint (client-side calculation) (v4: sparse heatmap representation)
      timestamp: new Date().toISOString(),
      heatmapDimensions, // Contains all bounds needed for client-side cell calculation
      timeSlices,
      timeRange,
      recordTypes,
      resolutions,
      resolutionDimensions,
      tags,
      sections: this.sections,
      stats
    };
    
    // Encode metadata
    const encodedMetadata = encode(metadata);
    const metadataSize = encodedMetadata.byteLength;
    
    // Close current writer
    await this.writer.end();
    
    // Reopen file to write metadata at the beginning
    const file = Bun.file(this.binaryPath);
    const existingData = await file.arrayBuffer();
    
    // Create new file with metadata at the beginning
    const newWriter = Bun.file(this.binaryPath).writer();
    
    // Write metadata size
    const sizeBuffer = Buffer.allocUnsafe(4);
    sizeBuffer.writeUInt32BE(metadataSize, 0);
    newWriter.write(sizeBuffer);
    
    // Write metadata
    newWriter.write(encodedMetadata);
    
    // Write the rest of the data (skip the placeholder size bytes)
    const restOfData = new Uint8Array(existingData, 4);
    newWriter.write(restOfData);
    
    await newWriter.end();
    
    console.log(`✅ Visualization binary finalized:`);
    console.log(`   - Version: ${metadata.version}`);
    console.log(`   - Metadata: ${metadataSize} bytes`);
    console.log(`   - TimeSlices: ${timeSlices.length}`);
    console.log(`   - Heatmaps: ${this.sections.heatmaps.length} bytes`);
    console.log(`   - Histograms: ${this.sections.histograms.length} bytes`);
    console.log(`   - Total size: ${4 + metadataSize + this.currentOffset - 4} bytes`);
    
    if (stats) {
      console.log(`   - Features: ${stats.totalFeatures} total across ${stats.timeSliceCount} time slices`);
    }
  }
}

/**
 * Create visualization binary with both heatmaps and histograms
 */
export async function createVisualizationBinary(
  binaryPath: string,
  heatmapResolutions: HeatmapResolutions,
  histograms: Histograms,
  heatmapDimensions: HeatmapDimensions,
  timeSlices: TimeSlice[],
  recordTypes: RecordType[],
  resolutions: HeatmapResolutionConfig[],
  tags: string[],
  bounds: { minLon: number; maxLon: number; minLat: number; maxLat: number },
  stats?: VisualizationMetadata['stats']
): Promise<void> {
  const writer = new VisualizationBinaryWriter(binaryPath);

  try {
    await writer.initialize();

    // Write both data types (both required)
    await writer.writeHeatmaps(heatmapResolutions);
    await writer.writeHistograms(histograms);

    await writer.finalize(
      heatmapDimensions,
      timeSlices,
      recordTypes,
      resolutions,
      tags,
      bounds,
      stats
    );

    console.log(`🎉 Successfully created visualization binary: ${binaryPath}`);
  } catch (error) {
    console.error(`❌ Failed to create visualization binary:`, error);
    throw error;
  }
}

/**
 * Generate visualization statistics from existing interfaces
 */
export function generateVisualizationStats(
  heatmapResolutions: HeatmapResolutions,
  histograms: Histograms,
  timeSlices: TimeSlice[]
): VisualizationMetadata['stats'] {
  let totalFeatures = 0;
  const featuresPerRecordType: Record<RecordType, number> = {
    text: 0,
    image: 0,
    person: 0,
    unknown: 0
  };
  
  // Use the first resolution for counting (all resolutions have same data, different spatial detail)
  const firstResolutionKey = Object.keys(heatmapResolutions)[0];
  if (firstResolutionKey) {
    const heatmapTimeline = heatmapResolutions[firstResolutionKey];
    
    // Count features from sparse heatmaps (spatial aggregation)
    for (const [timeSliceKey, timeSliceData] of Object.entries(heatmapTimeline)) {
      for (const [recordType, recordTypeData] of Object.entries(timeSliceData)) {
        const counts = Array.from(recordTypeData.base.counts || []);
        const recordTypeTotal = counts.reduce((sum, count) => sum + count, 0);

        featuresPerRecordType[recordType as RecordType] += recordTypeTotal;
        totalFeatures += recordTypeTotal;
      }
    }

    // Get grid cell count from dimensions
    let gridCellCount = 0;
    const timeSlices = Object.values(heatmapTimeline);
    for (const timeSlice of timeSlices) {
      const recordTypes = Object.values(timeSlice);
      for (const recordType of recordTypes) {
        if (recordType?.base?.dimensions) {
          gridCellCount = recordType.base.dimensions.rows * recordType.base.dimensions.cols;
          break;
        }
      }
      if (gridCellCount > 0) break;
    }
    
    return {
      totalFeatures,
      featuresPerRecordType,
      timeSliceCount: timeSlices.length,
      gridCellCount,
      resolutionCount: Object.keys(heatmapResolutions).length
    };
  }
  
  // Fallback to histograms if no heatmaps
  for (const [recordType, recordTypeData] of Object.entries(histograms)) {
    const baseHistogram = recordTypeData.base;
    featuresPerRecordType[recordType as RecordType] = baseHistogram.totalFeatures;
    totalFeatures += baseHistogram.totalFeatures;
  }
  
  return {
    totalFeatures,
    featuresPerRecordType,
    timeSliceCount: timeSlices.length,
    gridCellCount: 0,
    resolutionCount: Object.keys(heatmapResolutions).length
  };
}

/**
 * Merge multiple heatmap resolutions - not typically needed since generateHeatmapResolutions returns complete structure
 */
export function mergeHeatmapResolutions(resolutions: HeatmapResolutions[]): HeatmapResolutions {
  if (resolutions.length === 0) {
    throw new Error('Cannot merge empty array of heatmap resolutions');
  }
  
  if (resolutions.length === 1) {
    return resolutions[0];
  }
  
  // Merge all resolutions into one
  const merged: HeatmapResolutions = {};
  
  for (const resolutionSet of resolutions) {
    for (const [resolutionKey, heatmapTimeline] of Object.entries(resolutionSet)) {
      if (!merged[resolutionKey]) {
        merged[resolutionKey] = heatmapTimeline;
      } else {
        console.warn(`⚠️ Resolution ${resolutionKey} exists in multiple sets, using first occurrence`);
      }
    }
  }
  
  console.log(`✅ Merged ${resolutions.length} heatmap resolution sets into ${Object.keys(merged).length} resolutions`);
  return merged;
}

/**
 * Merge multiple histogram collections
 */
export function mergeHistograms(histogramCollections: Histograms[]): Histograms {
  if (histogramCollections.length === 0) {
    return {};
  }
  
  if (histogramCollections.length === 1) {
    return histogramCollections[0];
  }
  
  // Merge all histogram collections into one
  const merged: Histograms = {};
  
  for (const histograms of histogramCollections) {
    for (const [recordType, recordTypeData] of Object.entries(histograms)) {
      if (!merged[recordType]) {
        merged[recordType] = recordTypeData;
      } else {
        console.warn(`⚠️ RecordType ${recordType} exists in multiple histogram collections, using first occurrence`);
      }
    }
  }
  
  console.log(`✅ Merged ${histogramCollections.length} histogram collections into ${Object.keys(merged).length} recordTypes`);
  return merged;
}

/**
 * Convenience function to create visualization data from resolutions and histograms
 */
export function createVisualizationData(
  heatmapResolutions: HeatmapResolutions,
  histograms: Histograms
): VisualizationData {
  return {
    heatmaps: heatmapResolutions,
    histograms
  };
}

/**
 * Generate visualization binary directly from HeatmapResolutions and generated histograms
 */
//export async function generateVisualizationBinaryFromResolutions(
//  binaryPath: string,
//  heatmapResolutions: HeatmapResolutions,
//  config: any, // DatabaseConfig
//  bounds: any, // HeatmapCellBounds  
//  chunkConfig: any, // ChunkingConfig
//  timeSlices: TimeSlice[],
//  recordTypes: RecordType[],
//  tags: string[] = []
//): Promise<void> {
//  console.log(`🎯 Generating visualization binary from HeatmapResolutions...`);
//  
//  // Generate default histograms
//  const histograms = await generateDefaultHistograms(
//    config,
//    bounds,
//    chunkConfig,
//    timeSlices,
//    recordTypes,
//    tags
//  );
//  
//  // Extract resolutions config from the HeatmapResolutions keys
//  const resolutions: HeatmapResolutionConfig[] = Object.keys(heatmapResolutions).map(key => {
//    const [cols, rows] = key.split('x').map(Number);
//    return { cols, rows };
//  });
//  
//  // Get dimensions from first resolution for metadata
//  const firstResolutionKey = Object.keys(heatmapResolutions)[0];
//  const firstResolution = heatmapResolutions[firstResolutionKey];
//  
//  // Extract dimensions from first heatmap
//  const firstTimeSlice = Object.values(firstResolution)[0];
//  const firstRecordType = Object.values(firstTimeSlice)[0];
//  const gridCellCount = firstRecordType.base.dimensions?.rows * firstRecordType.base.dimensions?.cols || 0;
//  
//  // Calculate dimensions from grid cell count and first resolution
//  const firstResConfig = resolutions[0];
//  const expectedCellCount = firstResConfig.cols * firstResConfig.rows;
//  
//  const heatmapDimensions: HeatmapDimensions = {
//    colsAmount: firstResConfig.cols,
//    rowsAmount: firstResConfig.rows,
//    cellWidth: (bounds.maxLon - bounds.minLon) / firstResConfig.cols,
//    cellHeight: (bounds.maxLat - bounds.minLat) / firstResConfig.rows,
//    minLon: bounds.minLon,
//    maxLon: bounds.maxLon,
//    minLat: bounds.minLat,
//    maxLat: bounds.maxLat
//  };
//  
//  // Generate blueprint from dimensions
//  const { generateHeatmapBlueprint } = await import('../visualization/heatmap');
//  const heatmapBlueprint = generateHeatmapBlueprint(heatmapDimensions);
//  
//  // Generate stats
//  const stats = generateVisualizationStats(heatmapResolutions, histograms, timeSlices);
//  
//  // Create the binary
//  await createVisualizationBinary(
//    binaryPath,
//    heatmapResolutions,
//    histograms,
//    heatmapDimensions,
//    heatmapBlueprint,
//    timeSlices,
//    recordTypes,
//    resolutions,
//    tags,
//    {
//      minLon: heatmapDimensions.minLon,
//      maxLon: heatmapDimensions.maxLon,
//      minLat: heatmapDimensions.minLat,
//      maxLat: heatmapDimensions.maxLat
//    }
//  );
//  
//  console.log(`✅ Generated visualization binary with ${resolutions.length} resolutions and ${histograms.length} histograms`);
//}

/**
 * Generate empty histograms (legacy histogram generation removed)
 */
export async function generateDefaultHistograms(
  config: any, // DatabaseConfig
  bounds: any, // HeatmapCellBounds
  chunkConfig: any, // ChunkingConfig  
  timeSlices: TimeSlice[],
  recordTypes: RecordType[],
  tags: string[] = []
): Promise<Histograms> {
  console.log(`📊 Generating empty histograms (legacy histogram generation removed)...`);
  
  const histograms: Histograms = {};
  
  // Generate empty histogram structure for each record type
  for (const recordType of recordTypes) {
    console.log(`📈 Creating empty histogram for recordType: ${recordType}`);
    
    histograms[recordType] = {
      base: {
        totalFeatures: 0,
        maxCount: 0,
        timeRange: {
          start: timeSlices[0]?.timeRange?.start || '1600-01-01',
          end: timeSlices[timeSlices.length - 1]?.timeRange?.end || '2025-12-31'
        },
        bins: timeSlices.map(timeSlice => ({
          timeSlice: timeSlice,
          count: 0
        }))
      },
      tags: {}
    };
    
    // Create empty tag histograms
    for (const tag of tags.slice(0, 5)) { // Limit to first 5 tags per recordType
      histograms[recordType].tags[tag] = {
        totalFeatures: 0,
        maxCount: 0,
        timeRange: {
          start: timeSlices[0]?.timeRange?.start || '1600-01-01',
          end: timeSlices[timeSlices.length - 1]?.timeRange?.end || '2025-12-31'
        },
        bins: timeSlices.map(timeSlice => ({
          timeSlice: timeSlice,
          count: 0
        }))
      };
    }
  }
  
  console.log(`✅ Generated empty histograms for ${recordTypes.length} recordTypes and ${tags.length} tags`);
  return histograms;
}

/**
 * Binary reader class for loading visualization data
 */
export class VisualizationBinaryReader {
  constructor(private binaryPath: string) {}
  
  /**
   * Read metadata from binary file
   */
  async readMetadata(): Promise<VisualizationMetadata> {
    const file = Bun.file(this.binaryPath);
    const buffer = await file.arrayBuffer();
    
    // Read metadata size
    const dataView = new DataView(buffer);
    const metadataSize = dataView.getUint32(0, false);
    
    // Read and decode metadata
    const metadataBytes = new Uint8Array(buffer, 4, metadataSize);
    const metadata = decode(metadataBytes) as VisualizationMetadata;
    
    return metadata;
  }
  
  /**
   * Read heatmaps data from binary file (v4.0.0+ granular format)
   */
  async readHeatmaps(): Promise<HeatmapResolutions> {
    const metadata = await this.readMetadata();
    const file = Bun.file(this.binaryPath);
    const buffer = await file.arrayBuffer();

    const dataView = new DataView(buffer);
    const metadataSize = dataView.getUint32(0, false);
    const dataStartOffset = 4 + metadataSize;
    const heatmapsOffset = metadata.sections.heatmaps.offset;
    const index = metadata.sections.heatmaps.index;

    // Reconstruct HeatmapResolutions from granular sections
    const heatmapResolutions: HeatmapResolutions = {};

    for (const [resKey, timeSlices] of Object.entries(index)) {
      heatmapResolutions[resKey] = {};

      for (const [tsKey, recordTypes] of Object.entries(timeSlices)) {
        heatmapResolutions[resKey][tsKey] = {} as any;

        for (const [rtKey, sections] of Object.entries(recordTypes)) {
          // Read base heatmap
          const baseBytes = new Uint8Array(
            buffer,
            dataStartOffset + heatmapsOffset + sections.base.offset,
            sections.base.length
          );
          const baseHeatmap = decode(baseBytes) as Heatmap;

          // Read tag heatmaps
          const tagHeatmaps: Record<string, Heatmap> = {};
          for (const [tagKey, tagSection] of Object.entries(sections.tags)) {
            const tagBytes = new Uint8Array(
              buffer,
              dataStartOffset + heatmapsOffset + tagSection.offset,
              tagSection.length
            );
            tagHeatmaps[tagKey] = decode(tagBytes) as Heatmap;
          }

          heatmapResolutions[resKey][tsKey][rtKey as RecordType] = {
            base: baseHeatmap,
            tags: tagHeatmaps
          };
        }
      }
    }

    return heatmapResolutions;
  }
  
  /**
   * Read histograms data from binary file (v4.0.0+ granular format)
   */
  async readHistograms(): Promise<Histograms> {
    const metadata = await this.readMetadata();
    const file = Bun.file(this.binaryPath);
    const buffer = await file.arrayBuffer();

    const dataView = new DataView(buffer);
    const metadataSize = dataView.getUint32(0, false);
    const dataStartOffset = 4 + metadataSize;
    const histogramsOffset = metadata.sections.histograms.offset;
    const index = metadata.sections.histograms.index;

    // Reconstruct Histograms from granular sections
    const histograms: Histograms = {};

    for (const [rtKey, sections] of Object.entries(index)) {
      // Read base histogram
      const baseBytes = new Uint8Array(
        buffer,
        dataStartOffset + histogramsOffset + sections.base.offset,
        sections.base.length
      );
      const baseHistogram = decode(baseBytes) as Histogram;

      // Read tag histograms
      const tagHistograms: Record<string, Histogram> = {};
      for (const [tagKey, tagSection] of Object.entries(sections.tags)) {
        const tagBytes = new Uint8Array(
          buffer,
          dataStartOffset + histogramsOffset + tagSection.offset,
          tagSection.length
        );
        tagHistograms[tagKey] = decode(tagBytes) as Histogram;
      }

      histograms[rtKey as RecordType] = {
        base: baseHistogram,
        tags: tagHistograms
      };
    }

    return histograms;
  }
  
  /**
   * Read complete visualization data from binary file
   */
  async readComplete(): Promise<VisualizationData & { metadata: VisualizationMetadata }> {
    const metadata = await this.readMetadata();
    const heatmaps = await this.readHeatmaps();
    const histograms = await this.readHistograms();
    
    return {
      heatmaps,
      histograms,
      metadata
    };
  }
}
