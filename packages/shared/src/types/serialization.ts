import { TimeSlice } from "./temporal";
import { RecordType, PlaceType } from "./feature";

/**
 * Complete visualization metadata from /api/metadata
 */
export interface VisualizationMetadata {
  timeSlices: TimeSlice[];
  recordTypes: RecordType[];
  placeTypes: PlaceType[];
  datasets: { id: string; label: string }[];
  tags: string[];
}
