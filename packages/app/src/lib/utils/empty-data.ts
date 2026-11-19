/** What the loaders show when there is nothing to fetch: no cells, no bars. */
import type { Histogram, HeatmapTimeline } from '@atm/shared/types';

export const EMPTY_HISTOGRAM: Histogram = { bins: [], maxCount: 0, timeRange: { start: '', end: '' }, totalFeatures: 0 };
export const EMPTY_TIMELINE: HeatmapTimeline = {};
