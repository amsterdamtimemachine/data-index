import type { Coordinates } from './spatial';
import type { HeatmapCellBounds } from './heatmap';

export type RecordType = 'image' | 'text' | 'person' | 'unknown';

// ============================================================================
// Legacy types (for preprocessor compatibility)
// ============================================================================

// Your Amsterdam API feature structure (input format)
export interface RawFeature {
    ds: string;           // Dataset source
    geom: string;         // WKT geometry string
    per: [number, number]; // Time period [start_year, end_year]
    tit: string;          // Title
    url: string;          // Source URL
    recordType: RecordType;
    tags?: string[];
}

export interface ImageFeature extends RawFeature {
    thumbnail: string;
    alt?: string;
}

export interface TextFeature extends RawFeature {
    text: string;
}

export type Feature = ImageFeature | TextFeature;

// feature for optimized discovery processing
// Contains only essential fields needed for accumulator processing
export interface MinimalFeature {
    coordinates: Coordinates;
    recordType: RecordType;
    tags: string[];
    startYear: number;
    endYear: number;
}

// ============================================================================
// Features API types (for /api/features endpoint)
// ============================================================================

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


