import { TimeSlice } from "./temporal";
import { RecordType } from "./feature";

/**
 * Complete visualization metadata from /api/metadata
 */
export interface VisualizationMetadata {
  timeSlices: TimeSlice[];
  timeRange: {
    start: string;
    end: string;
  };
  recordTypes: RecordType[];
  sources: { id: string; label: string }[];
  tags: string[];
  stats?: {
    totalFeatures: number;
    featuresPerRecordType: Record<RecordType, number>;
    timeSliceCount: number;
    gridCellCount: number;
  };
}
