import type { TimeSlice, TimeRange } from "./temporal";

/**
 * Single bin representing one time period
 */
export interface HistogramBin {
  timeSlice: TimeSlice;
  count: number;
}

/**
 * Histogram with bins for each time period
 */
export interface Histogram {
  bins: HistogramBin[];
  maxCount: number;
  timeRange: TimeRange;
  totalFeatures: number;
}
