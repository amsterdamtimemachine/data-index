import { TimeSlice } from "./temporal";
import { RecordType } from "./feature";

/**
 * Complete visualization metadata from /api/metadata
 */
export interface VisualizationMetadata {
  version: string;
  timestamp: string;
  timeSlices: TimeSlice[];
  timeRange: {
    start: string;
    end: string;
  };
  recordTypes: RecordType[];
  tags: string[];
  stats?: {
    totalFeatures: number;
    featuresPerRecordType: Record<RecordType, number>;
    timeSliceCount: number;
    gridCellCount: number;
  };
}
