import type { HeatmapCellBounds } from './heatmap';

export type RecordType = 'image' | 'text' | 'person' | 'event' | 'unknown';

// 'sample' and 'spatialFrequency' interleave record types and datasets (double
// rotation); 'date' is flat chronology; 'relevance' is the legacy blended score
// (API-only, no UI entry); 'bestMatch' is flat ts_rank order, only meaningful with
// a searchQuery.
export type FeaturesSortField = 'sample' | 'relevance' | 'spatialFrequency' | 'datePrecision' | 'date' | 'bestMatch';
export type SortDirection = 'asc' | 'desc';
export type TagOperator = 'AND' | 'OR';

/**
 * Filters that select individual features rather than bucket categories: a text
 * search and/or a tag selection. The heatmap, histogram and feature list apply
 * them identically (see @atm/db queries/match-filters.ts).
 */
export interface MatchFilters {
  searchQuery?: string;
  tags?: string[];
  tagOperator?: TagOperator;
}

/**
 * Schema.org entity types
 */
export interface EntityBase {
  id?: string;
  type: "Person" | "CreativeWork" | "MediaObject" | "ScreeningEvent" | "EventSeries";
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
  type: "CreativeWork" | "MediaObject";
  dateCreated?: string;
  author?: string;
  url?: string;
}

export interface MediaObjectEntity extends CreativeWorkEntity {
  type: "MediaObject";
  contentUrl: string;
}

export interface MovieEntity {
  type: "Movie";
  name: string;
  url?: string;
  dateCreated?: string;
  countryOfOrigin?: string;
  director?: string;
  productionCompany?: string;
}

/**
 * The venue of a screening; identifier is its permanent id at the source. The type
 * follows the source's venue kind: a cinema or a travelling cinema is a MovieTheater,
 * a theatre a PerformingArtsTheater, a hall, club premises or an unknown kind an
 * EventVenue. additionalType keeps the source's own wording.
 */
export const VENUE_KINDS = ['MovieTheater', 'PerformingArtsTheater', 'EventVenue'] as const;
export type VenueKind = (typeof VENUE_KINDS)[number];
// a hall, club premises or an unknown kind
export const VENUE_KIND_FALLBACK: VenueKind = 'EventVenue';

export interface VenueEntity {
  type: VenueKind;
  name: string;
  identifier: string;
  additionalType?: string;
  address?: string;
  url?: string;
}

/** One programme: a screening at a venue on a date, with its bill. */
export interface ScreeningEventEntity extends EntityBase {
  type: "ScreeningEvent";
  // the programme's own title where the source has one
  alternateName?: string;
  // source precision: YYYY-MM-DD, or YYYY-MM for a partial date
  startDate: string;
  location: VenueEntity;
  workPresented: MovieEntity[];
  // a live act on the bill, as the source words it
  performer?: string;
  // the newspapers the programme was taken from
  citation?: string[];
}

/**
 * A dataset's features sharing a group key, as one row of the feature list: a
 * cinema's programmes. Never stored; the list query derives it from the members in
 * the population, so the span and the years follow the period and the filters.
 */
export interface EventSeriesEntity extends EntityBase {
  type: "EventSeries";
  location: VenueEntity;
  startDate: string;
  endDate: string;
  // members per year, ascending
  years: Array<{ year: number; count: number }>;
}

/** Discriminated union of all concrete entity types. */
export type Entity = PersonEntity | CreativeWorkEntity | MediaObjectEntity | ScreeningEventEntity | EventSeriesEntity;


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

/**
 * Spatial population of a features query: a display cell's bounds (inverted to a
 * base-cell range server-side) or a place's cell set.
 */
export type FeaturesArea =
  | { kind: 'bounds'; bounds: HeatmapCellBounds }
  // the display cells the place lies in, at the grid width the map renders (cols)
  | { kind: 'place'; placeId: string; cols?: number };

export interface FeaturesQuery {
  area: FeaturesArea;
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
  // Dutch FTS over feature labels (websearch syntax); also the ranking input for
  // sort='bestMatch'.
  searchQuery?: string;
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
  tags: string[]; // tag ids; the UI translates them
  datasetId?: string;
  datasetLabel?: string;
  // set on a group row: with datasetId, the key for /api/features/group
  groupKey?: string;
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

/** The members of one group (a dataset's features sharing a group key) in a date window. */
export interface GroupFeaturesQuery {
  datasetId: string;
  groupKey: string;
  // inclusive, YYYY-MM-DD
  start: string;
  end: string;
}

export interface GroupFeature {
  id: string;
  url?: string;
  label: string;
  startDate: string;
  endDate: string;
  entity?: Entity;
}

export interface GroupFeaturesResponse {
  data: GroupFeature[];
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
