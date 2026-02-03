import { pgTable, text, date, smallint, integer, real, customType, primaryKey, index } from 'drizzle-orm/pg-core';

// Custom PostGIS geometry type - stored in RD (Dutch) coordinates
// Transform to WGS84 (4326) for frontend display
const geometry = customType<{ data: string; driverData: string }>({
  dataType() {
    return 'geometry(Geometry, 28992)';
  }
});

// ============================================================================
// SOURCES - Data sources (e.g., Stadsarchief Beeldbank)
// ============================================================================
export const sources = pgTable('sources', {
  id: text('id').primaryKey(),
  label: text('label').notNull(),
  description: text('description'),
  url: text('url')
});

// ============================================================================
// ADAMLINK - Locations from Adamlink (addresses, streets, districts)
// ============================================================================
export const adamlink = pgTable('adamlink', {
  id: text('id').primaryKey(),                    // "https://adamlink.nl/geo/address/A181758"
  type: text('type').notNull(),                   // "address" | "street" | "district"
  geometry: geometry('geometry')                  // POINT, LINESTRING, or POLYGON
}, (table) => [
  index('idx_adamlink_geometry').using('gist', table.geometry)
]);

// ============================================================================
// TAGS - Predefined tags for features
// ============================================================================
export const tags = pgTable('tags', {
  id: text('id').primaryKey(),                    // "nature"
  label: text('label').notNull()                  // "Nature"
});

// ============================================================================
// FEATURES - Main content items (images, text, video, audio, persons)
// ============================================================================
export const features = pgTable('features', {
  id: text('id').primaryKey(),                    // "https://archief.amsterdam/beeldbank/detail/..."
  recordType: text('record_type').notNull(),      // "image" | "text" | "person" | "video" | "audio"
  label: text('label').notNull(),                 // "Rosendaalstraat 91-97"
  description: text('description'),               // Full-text searchable description
  contentUrl: text('content_url'),                // Media URL
  startDate: date('start_date'),                  // 1948-09-01
  endDate: date('end_date'),                      // 1948-09-30
  dateCreated: text('date_created'),              // "september 1948"
  sourceId: text('source_id').references(() => sources.id),
  geometry: geometry('geometry'),                 // Calculated from linked adamlink locations
  cellCount: integer('cell_count'),               // Number of grid cells this feature spans
  weight: real('weight')                          // 1/cellCount for ranking
}, (table) => [
  index('idx_features_geometry').using('gist', table.geometry),
  index('idx_features_dates').on(table.startDate, table.endDate),
  index('idx_features_record_type').on(table.recordType)
]);

// ============================================================================
// JUNCTION: feature_to_adamlink - Links features to Adamlink locations
// ============================================================================
export const featureToAdamlink = pgTable('feature_to_adamlink', {
  featureId: text('feature_id').notNull().references(() => features.id),
  adamlinkId: text('adamlink_id').notNull().references(() => adamlink.id)
}, (table) => [
  primaryKey({ columns: [table.featureId, table.adamlinkId] }),
  index('idx_feature_to_adamlink_adamlink').on(table.adamlinkId)
]);

// ============================================================================
// JUNCTION: feature_tags - Links features to tags
// ============================================================================
export const featureTags = pgTable('feature_tags', {
  featureId: text('feature_id').notNull().references(() => features.id),
  tagId: text('tag_id').notNull().references(() => tags.id)
}, (table) => [
  primaryKey({ columns: [table.featureId, table.tagId] }),
  index('idx_feature_tags_tag').on(table.tagId)
]);

// ============================================================================
// JUNCTION: feature_cells - Grid cells each feature spans (for heatmap)
// Pre-computed at 100m resolution for fast aggregation
// ============================================================================
export const featureCells = pgTable('feature_cells', {
  featureId: text('feature_id').notNull().references(() => features.id),
  cellX: smallint('cell_x').notNull(),            // 100m resolution base grid
  cellY: smallint('cell_y').notNull()             // 100m resolution base grid
}, (table) => [
  primaryKey({ columns: [table.featureId, table.cellX, table.cellY] }),
  index('idx_feature_cells_cell').on(table.cellX, table.cellY),
  index('idx_feature_cells_feature').on(table.featureId)
]);

// ============================================================================
// TYPE EXPORTS (Drizzle-inferred types for internal use)
// ============================================================================
export type Source = typeof sources.$inferSelect;
export type NewSource = typeof sources.$inferInsert;

export type Adamlink = typeof adamlink.$inferSelect;
export type NewAdamlink = typeof adamlink.$inferInsert;

export type Tag = typeof tags.$inferSelect;
export type NewTag = typeof tags.$inferInsert;

export type FeatureRow = typeof features.$inferSelect;
export type NewFeature = typeof features.$inferInsert;

export type FeatureToAdamlink = typeof featureToAdamlink.$inferSelect;
export type FeatureTag = typeof featureTags.$inferSelect;
export type FeatureCell = typeof featureCells.$inferSelect;
