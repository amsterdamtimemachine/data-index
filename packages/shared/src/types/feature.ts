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
  type: "Person" | "CreativeWork" | "MediaObject";
  label: string; // name
}

export interface PersonEntity extends Entity {
  type: "Person";
  birthDate?: string;
  birthPlace?: string;
  deathDate?: string;
  deathPlace?: string;
}

export interface CreativeWorkEntity extends Entity {
  dateCreated?: string;
  author?: string;
  url?: string;
}

export interface MediaObjectEntity extends CreativeWorkEntity {
  type: "MediaObject";
  contentUrl: string;
}


/**
 * Query parameters for fetching features
 */
export interface FeaturesQuery {
  bounds: HeatmapCellBounds;
  recordTypes?: RecordType[];
  datasetIds?: string[];
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
  datasetLabel?: string;
  spatialFrequency: number;
  temporalFrequency: number;
  entity?: Entity | PersonEntity | MediaObjectEntity;
  relationId?: string;
  currentAddress?: string;
  historicalAddress?: string;
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
