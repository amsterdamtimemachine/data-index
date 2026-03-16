import type { HeatmapCellBounds } from './heatmap';

export type RecordType = 'image' | 'text' | 'person' | 'unknown';

export type FeaturesSortField = 'frequency' | 'date';
export type SortDirection = 'asc' | 'desc';
export type TagOperator = 'AND' | 'OR';

/**
 * Query parameters for fetching features
 */
export interface FeaturesQuery {
  bounds: HeatmapCellBounds;
  recordTypes?: RecordType[];
  tags?: string[];
  tagOperator?: TagOperator;
  timeSlice?: string;
  sort?: FeaturesSortField;
  sortDirection?: SortDirection;
  page?: number;
  pageSize?: number;
}

/**
 * Single feature in API response
 */
export interface FeatureResult {
  id: string;
  recordType: RecordType;
  label: string;
  description?: string;
  contentUrl?: string;
  dateRange: [number, number];
  tags: string[];
  sourceLabel?: string;
  frequency: number;
}

/**
 * Paginated features response
 */
export interface FeaturesResponse {
  data: FeatureResult[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}


