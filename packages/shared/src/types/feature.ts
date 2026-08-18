import type { HeatmapCellBounds } from './heatmap';

export type RecordType = 'image' | 'text' | 'person' | 'unknown';

// 'sample' and 'spatialFrequency' interleave record types and datasets (double
// rotation); 'date' is flat chronology; 'relevance' is the legacy blended score
// (API-only, no UI entry).
export type FeaturesSortField = 'sample' | 'relevance' | 'spatialFrequency' | 'temporalFrequency' | 'date';
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
export type PlaceType = 'address' | 'street' | 'neighbourhood' | 'district';

/** Where a place came from — Adamlink (historical) or a PDOK base registry. */
export type PlaceSource = 'adamlink' | 'cbs' | 'nwb' | 'bag';

/**
 * The institution behind each place source. Seeded into `organisations` (the same
 * table dataset providers live in) so `place.source` is a foreign key to it, and
 * the feature query joins it to render a clickable provider on the card. Keyed by
 * PlaceSource, so a new source can't be added without giving it a provider here.
 */
export const PLACE_PROVIDERS: Record<PlaceSource, { label: string; url: string }> = {
  adamlink: { label: 'Adamlink', url: 'https://adamlink.nl' },
  cbs: { label: 'CBS', url: 'https://www.cbs.nl' },
  nwb: { label: 'NWB', url: 'https://www.rijkswaterstaat.nl' },
  bag: { label: 'BAG', url: 'https://www.kadaster.nl' },
};

export interface FeaturesQuery {
  bounds: HeatmapCellBounds;
  recordTypes?: RecordType[];
  datasetIds?: string[];
  placeTypes?: PlaceType[];
  tags?: string[];
  tagOperator?: TagOperator;
  timeSlice?: string;
  sort?: FeaturesSortField;
  sortDirection?: SortDirection;
  // Shuffle seed for sort='sample'; same seed = same order (stable pagination).
  seed?: string;
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
  placeType?: PlaceType;
  label: string;
  description?: string;
  contentUrl?: string;
  dateRange: [number, number];
  tags: string[];
  datasetLabel?: string;
  datasetUrl?: string;
  organisationLabel?: string;
  organisationUrl?: string;
  spatialFrequency: number;
  temporalFrequency: number;
  entity?: Entity;
  relationId?: string;
  displayName?: string;
  historicalLabel?: string;
  placeSource?: PlaceSource;
  placeUrl?: string;
  placeProviderLabel?: string;
  placeProviderUrl?: string;
  // Set only when the geometry comes from a different provider than the place
  // (e.g. an Adamlink street backfilled from NWB); links to that source record.
  geometryProviderLabel?: string;
  geometryUrl?: string;
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
