import type { HeatmapCellBounds } from './heatmap';

export type RecordType = 'image' | 'text' | 'person' | 'unknown';

export type FeaturesSortField = 'relevance' | 'spatialFrequency' | 'date';
export type SortDirection = 'asc' | 'desc';
export type TagOperator = 'AND' | 'OR';

/**
 * Schema.org entity types
 */
export interface EntityBase {
  id?: string;
  type: "Person" | "CreativeWork" | "MediaObject";
  name: string;
}

export interface PersonEntity extends EntityBase {
  type: "Person";
  birthDate?: string;
  birthPlace?: string;
  deathDate?: string;
  deathPlace?: string;
}

export interface CreativeWorkEntity extends EntityBase {
  dateCreated?: string;
  author?: string;
  url?: string;
}

export interface MediaObjectEntity extends CreativeWorkEntity {
  type: "MediaObject";
  contentUrl: string;
}

/** Discriminated union of all concrete entity types. */
export type Entity = PersonEntity | CreativeWorkEntity | MediaObjectEntity;


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
  organisationLabel?: string;
  organisationUrl?: string;
  spatialFrequency: number;
  temporalFrequency: number;
  entity?: Entity;
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
