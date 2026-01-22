import { HeatmapDimensions, HeatmapResolutions, HeatmapResolutionConfig } from "./heatmap";
import { Histograms } from "./histogram";
import { TimeSlice } from "./temporal";
import { RecordType } from "./feature";

// Granular index types for memory-efficient mmap reads
export interface SectionIndex {
  offset: number;
  length: number;
}

export interface RecordTypeSections {
  base: SectionIndex;
  tags: Record<string, SectionIndex>;
}

export interface TimeSliceSections {
  [recordType: string]: RecordTypeSections;
}

export interface ResolutionSections {
  [timeSliceKey: string]: TimeSliceSections;
}

export interface HeatmapIndex {
  [resolutionKey: string]: ResolutionSections;
}

export interface HistogramRecordTypeSections {
  base: SectionIndex;
  tags: Record<string, SectionIndex>;
}

export interface HistogramIndex {
  [recordType: string]: HistogramRecordTypeSections;
}

export interface VisualizationMetadata {
  version: string;
  timestamp: string;
  heatmapDimensions: HeatmapDimensions; // Primary resolution - includes all bounds needed for client-side calculation
  timeSlices: TimeSlice[];
  timeRange: {
    start: string;
    end: string;
  };
  recordTypes: RecordType[];
  tags: string[];
  resolutions: HeatmapResolutionConfig[];
  resolutionDimensions: Record<string, HeatmapDimensions>; // All resolutions with their dimensions
  sections: {
    heatmaps: {
      offset: number;
      length: number;
      index: HeatmapIndex;
    };
    histograms: {
      offset: number;
      length: number;
      index: HistogramIndex;
    };
  };
  stats?: {
    totalFeatures: number;
    featuresPerRecordType: Record<RecordType, number>;
    timeSliceCount: number;
    gridCellCount: number;
    resolutionCount: number;
  };
}


export interface VisualizationData {
  heatmaps: HeatmapResolutions;
  histograms: Histograms;
}
