import type { HeatmapCellBounds } from './heatmap';

export type RecordType = 'image' | 'text' | 'person' | 'unknown';

export type FeaturesSortField = 'relevance' | 'spatialFrequency' | 'date';
export type SortDirection = 'asc' | 'desc';
export type TagOperator = 'AND' | 'OR';

/**
 * Schema.org entity types
 */
export interface Entity {
  id?: string;
  type: "Person" | "MediaObject";
  label: string;
}

export interface PersonEntity extends Entity {
  type: "Person";
  birthDate?: string;
  birthPlace?: string;
  deathDate?: string;
  deathPlace?: string;
}

export interface MediaObjectEntity extends Entity {
  type: "MediaObject";
  contentUrl: string;
  dateCreated?: string;
  author?: string;
}

/**
 * Query parameters for fetching features
 */
export interface FeaturesQuery {
  bounds: HeatmapCellBounds;
  recordTypes?: RecordType[];
  sourceIds?: string[];
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
  url?: string;
  recordType: RecordType;
  label: string;
  description?: string;
  contentUrl?: string;
  dateRange: [number, number];
  tags: string[];
  sourceLabel?: string;
  spatialFrequency: number;
  temporalFrequency: number;
  entity?: Entity | PersonEntity | MediaObjectEntity;
  relationId?: string;
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
