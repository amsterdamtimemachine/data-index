import type { HeatmapCellBounds } from './heatmap';
import type { VenueKind } from '../vocab/venues';
export type { VenueKind } from '../vocab/venues';

export type RecordType = 'image' | 'text' | 'person' | 'event' | 'story' | 'unknown';

/** Who produced data, after PROV: an institution, a classifier run, a person. */
export type AgentKind = 'Organization' | 'SoftwareAgent' | 'Person';

/** A classifier model that tagged a feature, with its page (model card or repository). */
export interface Classifier {
  id: string;
  label: string;
  url?: string;
}

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
  type: "Person" | "CreativeWork" | "MediaObject" | "ScreeningEvent" | "EventSeries" | "Manuscript";
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

/** A thing a work refers to, as the annotators identified it, with its page at the source that identifies it. */
export interface MentionEntity {
  type: "Place" | "Person" | "Organization";
  name: string;
  url?: string;
}

/** The diary an entry belongs to, with its page at the holding archive. */
export interface BookEntity {
  type: "Book";
  name: string;
  url?: string;
  // the years the diary covers, as the source words it ("1940/1945")
  temporalCoverage?: string;
  holdingArchive?: string;
}

/**
 * One diary entry: a dated piece of writing with its full transcription, its diary
 * and author, and everything the annotators identified in it. The places among the
 * mentions are also the feature's place links; the list keeps the rest.
 */
export interface ManuscriptEntity extends EntityBase {
  type: "Manuscript";
  // source precision: YYYY-MM-DD, YYYY-MM or YYYY
  dateCreated?: string;
  text: string;
  author?: { type: "Person"; name: string; url?: string };
  isPartOf?: BookEntity;
  mentions: MentionEntity[];
}

/** Discriminated union of all concrete entity types. */
export type Entity = PersonEntity | CreativeWorkEntity | MediaObjectEntity | ScreeningEventEntity | EventSeriesEntity | ManuscriptEntity;


/**
 * Query parameters for fetching features
 */
export type PlaceType = 'address' | 'street' | 'neighbourhood' | 'district';

/** Where a place came from — Adamlink (historical) or a PDOK base registry. */
export type PlaceSource = 'adamlink' | 'cbs' | 'nwb' | 'bag';


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
  // the classifier models behind the tags, one row each on the card
  classifiers: Classifier[];
  datasetId?: string;
  datasetLabel?: string;
  // set on a group row: with datasetId, the key for /api/features/group
  groupKey?: string;
  datasetUrl?: string;
  providerLabel?: string;
  providerUrl?: string;
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
