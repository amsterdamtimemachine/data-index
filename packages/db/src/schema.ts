import { pgTable, text, date, smallint, integer, uuid, jsonb, real, customType, primaryKey, index } from 'drizzle-orm/pg-core';

// Custom PostGIS geometry type - stored in RD (Dutch) coordinates
// Transform to WGS84 (4326) for frontend display
const geometry = customType<{ data: string; driverData: string }>({
  dataType() {
    return 'geometry(Geometry, 28992)';
  }
});

// ============================================================================
// ORGANISATIONS - Institutions that provide datasets
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
// PLACE - Physical geographic locations (one per LPS linked point)
// ============================================================================
export const place = pgTable('place', {
  id: text('id').primaryKey(),                    // "lp-1000001"
  type: text('type').notNull(),                   // "address" | "street" | "neighbourhood"
  preferredLabel: text('preferred_label'),         // preferred display name (most recent place_name entry)
  geometry: geometry('geometry'),                 // POINT, LINESTRING, or POLYGON
  spatialFrequency: integer('spatial_frequency')  // number of base cells this place's geometry spans
}, (table) => [
  index('idx_place_geometry').using('gist', table.geometry)
]);

// ============================================================================
// PLACE_NAME - Historical names for places (addresses, streets, buildings)
// ============================================================================
export const placeName = pgTable('place_name', {
  id: text('id').primaryKey(),                    // adamlink URI "https://adamlink.nl/geo/address/A1"
  placeId: text('place_id').notNull().references(() => place.id),
  name: text('name'),                             // "Prins Hendrikkade 93"
  since: date('since'),                           // name valid from this date
  until: date('until'),                           // name valid until this date
  source: text('source')                          // "pw-1943"
}, (table) => [
  index('idx_place_name_place').on(table.placeId),
  index('idx_place_name_place_since').on(table.placeId, table.since)
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
  id: uuid('id').primaryKey().defaultRandom(),
  url: text('url'),
  recordType: text('record_type').notNull(),
  label: text('label').notNull(),
  description: text('description'),
  contentUrl: text('content_url'),
  startDate: date('start_date'),
  endDate: date('end_date'),
  datasetId: text('dataset_id').references(() => datasets.id),
  temporalFrequency: integer('temporal_frequency'),
  entity: jsonb('entity'),
}, (table) => [
  index('idx_features_dates').on(table.startDate, table.endDate),
  index('idx_features_record_type').on(table.recordType)
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
// GRID_CONFIG - Pre-computed grid bounds from rebuild-index
// Single row, updated each time rebuild-index runs
// ============================================================================
export const gridConfig = pgTable('grid_config', {
  id: text('id').primaryKey(),                    // always 'current'
  minCellX: smallint('min_cell_x').notNull(),
  maxCellX: smallint('max_cell_x').notNull(),
  minCellY: smallint('min_cell_y').notNull(),
  maxCellY: smallint('max_cell_y').notNull(),
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

export type PlaceName = typeof placeName.$inferSelect;
export type NewPlaceName = typeof placeName.$inferInsert;

export type Relation = typeof relation.$inferSelect;
export type NewRelation = typeof relation.$inferInsert;

export type Tag = typeof tags.$inferSelect;
export type NewTag = typeof tags.$inferInsert;

export type FeatureRow = typeof features.$inferSelect;
export type NewFeature = typeof features.$inferInsert;

export type FeatureToPlace = typeof featureToPlace.$inferSelect;
export type FeatureTag = typeof featureTags.$inferSelect;
export type PlaceCell = typeof placeCells.$inferSelect;
