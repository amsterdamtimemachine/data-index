import { pgTable, text, date, smallint, integer, uuid, jsonb, real, doublePrecision, customType, primaryKey, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import type { PlaceSource } from '@atm/shared';

// Custom PostGIS geometry type - stored in RD (Dutch) coordinates
// Transform to WGS84 (4326) for frontend display
const geometry = customType<{ data: string; driverData: string }>({
  dataType() {
    return 'geometry(Geometry, 28992)';
  }
});

const tsvector = customType<{ data: string; driverData: string }>({
  dataType() {
    return 'tsvector';
  }
});

// Compressed set of int4s (pg_roaringbitmap). Unions dedupe, so buckets can be
// merged into any display grid without double-counting a feature that spans them.
const roaringbitmap = customType<{ data: string; driverData: string }>({
  dataType() {
    return 'roaringbitmap';
  }
});

// ============================================================================
// ORGANISATIONS - Institutions that provide datasets (via datasets.organisation_id)
// or place geometry (via place.source: Adamlink, CBS, NWB/Rijkswaterstaat, BAG/Kadaster)
// ============================================================================
export const organisations = pgTable('organisations', {
  id: text('id').primaryKey(),
  label: text('label').notNull(),
  description: text('description'),
  url: text('url')
});

// ============================================================================
// DATASETS - Data collections from organisations
// ============================================================================
export const datasets = pgTable('datasets', {
  id: text('id').primaryKey(),
  label: text('label').notNull(),
  description: text('description'),
  url: text('url'),
  organisationId: text('organisation_id').references(() => organisations.id)
});

// ============================================================================
// PLACE - Physical geographic locations (identity); geometry in place_geometry
// ============================================================================
export const place = pgTable('place', {
  id: text('id').primaryKey(),                    // Adamlink URI ("https://adamlink.nl/geo/{street,district,lp}/…") or PDOK "{cbs,nwb,bag}-<code>"
  type: text('type').notNull(),                   // "address" | "street" | "neighbourhood" (buurt) | "district" (wijk)
  name: text('name'),                            // name shown for the place; dated past names live in place_historical_name
  source: text('source').$type<PlaceSource>().references(() => organisations.id), // provider org, seeded from PLACE_PROVIDERS
  url: text('url')                               // canonical record at the source (adamlink.nl / bag.basisregistraties.overheid.nl / …)
}, (table) => [
  // exact case-insensitive name lookup (getCandidatesByName / inferByName)
  index('idx_place_name_lower').on(sql`lower(${table.name})`).where(sql`${table.name} is not null`),
  // prefix search (searchPlaces): LIKE 'q%' needs text_pattern_ops
  index('idx_place_name_prefix').on(sql`lower(${table.name}) text_pattern_ops`).where(sql`${table.name} is not null`)
]);

// ============================================================================
// PLACE_GEOMETRY - A place's geometry and the period it was valid (1:1 with place)
// ============================================================================
export const placeGeometry = pgTable('place_geometry', {
  placeId: text('place_id').primaryKey().references(() => place.id),
  geometry: geometry('geometry'),                 // POINT, LINESTRING, or POLYGON
  spatialFrequency: integer('spatial_frequency'), // number of base cells this geometry spans
  // Geometry provenance, set ONLY when it differs from the place's own (place.source/url) —
  // e.g. NWB backfilling an Adamlink street that has no line. null = same provider as the place.
  source: text('source').$type<PlaceSource>().references(() => organisations.id),
  url: text('url'),                               // link to the geometry's source record
  // Period this geometry was the city's division — set ONLY for neighbourhood/district
  // (null for address/street). until null = open/current.
  since: date('since'),
  until: date('until')
}, (table) => [
  index('idx_place_geometry_geom').using('gist', table.geometry)
]);

// ============================================================================
// PLACE_HISTORICAL_NAME - Dated past names for places (addresses, streets)
// ============================================================================
export const placeHistoricalName = pgTable('place_historical_name', {
  id: text('id').primaryKey(),                    // adamlink URI "https://adamlink.nl/geo/address/A1"
  placeId: text('place_id').notNull().references(() => place.id),
  name: text('name'),                             // "Prins Hendrikkade 93"
  since: date('since'),                           // name valid from this date
  until: date('until'),                           // name valid until this date
  source: text('source')                          // "pw-1943"
}, (table) => [
  index('idx_place_historical_name_place').on(table.placeId),
  index('idx_place_historical_name_place_since').on(table.placeId, table.since),
  index('idx_place_historical_name_lower').on(sql`lower(${table.name})`).where(sql`${table.name} is not null`),
  index('idx_place_historical_name_prefix').on(sql`lower(${table.name}) text_pattern_ops`).where(sql`${table.name} is not null`)
]);

// ============================================================================
// RELATION - Describes how features relate to places
// ============================================================================
export const relation = pgTable('relation', {
  id: text('id').primaryKey(),
  label: text('label').notNull()
});

// ============================================================================
// TAGS - Predefined tags for features
// ============================================================================
export const tags = pgTable('tags', {
  id: text('id').primaryKey(),
  label: text('label').notNull()
});

// ============================================================================
// FEATURES - Main content items (images, text, video, audio, persons)
// ============================================================================
export const features = pgTable('features', {
  id: uuid('id').primaryKey(),
  // roaring-bitmap surrogate: bitmaps hold int4 and id is a uuid. DB-assigned on
  // insert; only build-cell-features and the search-bitmap helper may read it.
  featureIntId: integer('feature_int_id').generatedAlwaysAsIdentity(),
  url: text('url').notNull(),
  recordType: text('record_type').notNull(),
  label: text('label').notNull(),
  // stemmed label, kept in sync by the DB; the text-search predicate and ts_rank
  // both read this column (see queries/feature-search.ts)
  labelTsv: tsvector('label_tsv').generatedAlwaysAs(sql`to_tsvector('dutch', label)`),
  description: text('description'),
  contentUrl: text('content_url'),
  startDate: date('start_date').notNull(),
  endDate: date('end_date').notNull(),
  datasetId: text('dataset_id').notNull().references(() => datasets.id),
  temporalFrequency: integer('temporal_frequency'),
  entity: jsonb('entity'),
}, (table) => [
  index('idx_features_dates').on(table.startDate, table.endDate),
  index('idx_features_record_type').on(table.recordType),
  uniqueIndex('idx_features_int_id').on(table.featureIntId),
  index('idx_features_label_fts').using('gin', table.labelTsv)
]);

// ============================================================================
// JUNCTION: feature_to_place - Links features to places with a relation
// ============================================================================
export const featureToPlace = pgTable('feature_to_place', {
  featureId: uuid('feature_id').notNull().references(() => features.id),
  placeId: text('place_id').notNull().references(() => place.id),
  relationId: text('relation_id').references(() => relation.id)
}, (table) => [
  primaryKey({ columns: [table.featureId, table.placeId] }),
  index('idx_feature_to_place_place').on(table.placeId)
]);

// ============================================================================
// JUNCTION: feature_tags - Links features to tags
// ============================================================================
export const featureTags = pgTable('feature_tags', {
  featureId: uuid('feature_id').notNull().references(() => features.id),
  tagId: text('tag_id').notNull().references(() => tags.id)
}, (table) => [
  primaryKey({ columns: [table.featureId, table.tagId] }),
  index('idx_feature_tags_tag').on(table.tagId)
]);

// ============================================================================
// JUNCTION: place_cells - Grid cells each place spans (for heatmap)
// Pre-computed at 100m resolution for fast aggregation
// ============================================================================
export const placeCells = pgTable('place_cells', {
  placeId: text('place_id').notNull().references(() => place.id),
  cellX: smallint('cell_x').notNull(),
  cellY: smallint('cell_y').notNull()
}, (table) => [
  primaryKey({ columns: [table.placeId, table.cellX, table.cellY] }),
  index('idx_place_cells_cell').on(table.cellX, table.cellY),
  index('idx_place_cells_place').on(table.placeId)
]);

// ============================================================================
// CELL_FEATURES - Which features occupy each cell + period + category
// Cell-major inverse of place_cells: place_cells is "the cells each place covers",
// this is "the features in each cell". Materialises the feature -> feature_to_place
// -> place -> place_cells hop plus the time bin, so heatmap/histogram read one
// table instead of re-joining 2.7M rows per request. Rebuilt by rebuild-index.
//
// feature_ids holds features.feature_int_id, not features.id: roaringbitmap stores
// int4 and features.id is a 128-bit uuid. The surrogate is persisted on features, so
// external id sets (e.g. text-search matches) can be intersected with these bitmaps.
//
// time_bin is the PRECOMP_TIME_BIN_YEARS bin the feature's date range touches (one row per
// bin). Display bins are unions of whole base bins, which is why binSize must be a
// multiple of PRECOMP_TIME_BIN_YEARS (see normaliseBinSize).
// ============================================================================
export const cellFeatures = pgTable('cell_features', {
  cellX: smallint('cell_x').notNull(),
  cellY: smallint('cell_y').notNull(),
  timeBin: smallint('time_bin').notNull(),
  recordType: text('record_type').notNull(),
  datasetId: text('dataset_id').notNull(),
  placeType: text('place_type').notNull(),
  featureIds: roaringbitmap('feature_ids').notNull()
}, (table) => [
  // explicit short name: the auto-generated one exceeds Postgres' 63-byte identifier
  // cap, and the silent truncation made every drizzle push re-create the constraint
  primaryKey({ name: 'cell_features_pk', columns: [table.cellX, table.cellY, table.timeBin, table.recordType, table.datasetId, table.placeType] }),
  index('idx_cell_features_filters').on(table.recordType, table.datasetId, table.placeType)
]);

// ============================================================================
// GRID_CONFIG - Pre-computed grid metadata from rebuild-index
// Single row (id = 'current'), upserted each time rebuild-index runs
// ============================================================================
export const gridConfig = pgTable('grid_config', {
  id: text('id').primaryKey(),                    // always 'current'
  // Base-cell index extent (place_cells are 0-indexed from the RD origin).
  minCellX: smallint('min_cell_x').notNull(),
  maxCellX: smallint('max_cell_x').notNull(),
  minCellY: smallint('min_cell_y').notNull(),
  maxCellY: smallint('max_cell_y').notNull(),
  // RD/28992 grid origin in metres — the (min_x, min_y) the cell math floors
  // against: cell_x = floor((X - min_x) / cellSize).
  minX: doublePrecision('min_x').notNull(),
  minY: doublePrecision('min_y').notNull(),
  // WGS84 bounds of the *cell-grid rectangle* (origin + (maxCell+1) cells), NOT
  // the data envelope — so the frontend's linear cell interpolation tiles the
  // exact grid the heatmap counts against.
  minLon: real('min_lon').notNull(),
  maxLon: real('max_lon').notNull(),
  minLat: real('min_lat').notNull(),
  maxLat: real('max_lat').notNull(),
  maxSpatialFrequency: integer('max_spatial_frequency').notNull(),
  maxTemporalFrequency: integer('max_temporal_frequency').notNull(),
});

// ============================================================================
// TYPE EXPORTS (Drizzle-inferred types for internal use)
// ============================================================================
export type Organisation = typeof organisations.$inferSelect;
export type NewOrganisation = typeof organisations.$inferInsert;

export type Dataset = typeof datasets.$inferSelect;
export type NewDataset = typeof datasets.$inferInsert;

export type Place = typeof place.$inferSelect;
export type NewPlace = typeof place.$inferInsert;

export type PlaceGeometry = typeof placeGeometry.$inferSelect;
export type NewPlaceGeometry = typeof placeGeometry.$inferInsert;

export type PlaceHistoricalName = typeof placeHistoricalName.$inferSelect;
export type NewPlaceHistoricalName = typeof placeHistoricalName.$inferInsert;

export type Relation = typeof relation.$inferSelect;
export type NewRelation = typeof relation.$inferInsert;

export type Tag = typeof tags.$inferSelect;
export type NewTag = typeof tags.$inferInsert;

export type FeatureRow = typeof features.$inferSelect;
export type NewFeature = typeof features.$inferInsert;

export type FeatureToPlace = typeof featureToPlace.$inferSelect;
export type FeatureTag = typeof featureTags.$inferSelect;
export type PlaceCell = typeof placeCells.$inferSelect;
