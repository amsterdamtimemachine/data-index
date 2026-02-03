import { HeatmapDimensions, HeatmapResolutionConfig } from "./heatmap";
import { TimeSlice } from "./temporal";
import { RecordType } from "./feature";

/**
 * Complete visualization metadata from /api/metadata
 */
export interface VisualizationMetadata {
  version: string;
  timestamp: string;
  heatmapDimensions: HeatmapDimensions;
  timeSlices: TimeSlice[];
  timeRange: {
    start: string;
    end: string;
  };
  recordTypes: RecordType[];
  tags: string[];
  resolutions: HeatmapResolutionConfig[];
  resolutionDimensions: Record<string, HeatmapDimensions>;
  stats?: {
    totalFeatures: number;
    featuresPerRecordType: Record<RecordType, number>;
    timeSliceCount: number;
    gridCellCount: number;
    resolutionCount: number;
  };
}
