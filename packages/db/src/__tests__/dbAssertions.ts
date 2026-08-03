/**
 * Read-only DB inspectors used by integration tests to assert on ingestion +
 * rebuild-index side effects. Each function encapsulates one query and returns
 * a typed value; tests handle the actual `expect()` call.
 *
 * Keeping the SQL out of the test file means the test bodies read like
 * behaviour assertions instead of like database queries.
 *
 * These are also the single SOURCE OF TRUTH for expected counts: integration tests
 * cross-check the query layer (getFeatures / getHistogram / getMetadata) against
 * these independent direct queries instead of hardcoding magic numbers, so when the
 * fixtures change (e.g. more beeldbank rows) the expectations follow automatically.
 */
import { sql } from 'drizzle-orm';
import type { Entity } from '@atm/shared';
import { db } from './setup';
import type { CountRow } from '../row-types';

// ─── place ──────────────────────────────────────────────────────────────────

export async function placeCount(): Promise<number> {
  const r = await db.execute<CountRow>(
    sql`SELECT COUNT(*) as count FROM place`
  );
  return parseInt(r.rows[0].count);
}

/** Distinct features resolved onto a street place — beeldbank's street-fallback / line path. */
export async function streetLinkedFeatureCount(): Promise<number> {
  const r = await db.execute<CountRow>(sql`
    SELECT COUNT(DISTINCT fp.feature_id) as count
    FROM feature_to_place fp JOIN place p ON fp.place_id = p.id
    WHERE p.type = 'street'
  `);
  return parseInt(r.rows[0].count);
}

/** Max spatial_frequency among street places (a multi-cell LINESTRING spans >1 cell). */
export async function maxStreetSpatialFrequency(): Promise<number> {
  const r = await db.execute<CountRow>(
    sql`SELECT COALESCE(MAX(pg.spatial_frequency), 0) as count FROM place_geometry pg JOIN place p ON p.id = pg.place_id WHERE p.type = 'street'`
  );
  return parseInt(r.rows[0].count);
}

export async function firstPlaceId(): Promise<string> {
  const r = await db.execute<{ id: string }>(
    sql`SELECT id FROM place LIMIT 1`
  );
  return r.rows[0].id;
}

export async function placesWithGeometryCount(): Promise<number> {
  const r = await db.execute<CountRow>(
    sql`SELECT COUNT(*) as count FROM place_geometry WHERE geometry IS NOT NULL`
  );
  return parseInt(r.rows[0].count);
}

// ─── place_historical_name ─────────────────────────────────────────────────────────────

export async function placeNamesWithDanglingPlaceIdCount(): Promise<number> {
  const r = await db.execute<CountRow>(sql`
    SELECT COUNT(*) as count FROM place_historical_name pn
    WHERE NOT EXISTS (SELECT 1 FROM place p WHERE p.id = pn.place_id)
  `);
  return parseInt(r.rows[0].count);
}

export async function distinctPlaceNameSources(): Promise<string[]> {
  const r = await db.execute<{ source: string }>(
    sql`SELECT DISTINCT source FROM place_historical_name WHERE source IS NOT NULL`
  );
  return r.rows.map(row => row.source);
}

export async function placeNamesWithNameCount(): Promise<number> {
  const r = await db.execute<CountRow>(
    sql`SELECT COUNT(*) as count FROM place_historical_name WHERE name IS NOT NULL`
  );
  return parseInt(r.rows[0].count);
}

export async function placeNamesWithDateCount(): Promise<number> {
  const r = await db.execute<CountRow>(
    sql`SELECT COUNT(*) as count FROM place_historical_name WHERE since IS NOT NULL`
  );
  return parseInt(r.rows[0].count);
}

// ─── place ↔ place_historical_name consistency ─────────────────────────────────────────

export interface PlaceDisplayNameVsMostRecent {
  placeId: string;
  displayName: string;
  mostRecent: string;
}

export async function placesWithDisplayNameAndMostRecent(
  limit: number = 5
): Promise<PlaceDisplayNameVsMostRecent[]> {
  const r = await db.execute<{ place_id: string; name: string; most_recent: string }>(sql`
    SELECT p.id as place_id, p.name,
      (SELECT pn.name FROM place_historical_name pn
       WHERE pn.place_id = p.id AND pn.name IS NOT NULL
       ORDER BY pn.since DESC LIMIT 1) as most_recent
    FROM place p
    WHERE p.name IS NOT NULL
    LIMIT ${limit}
  `);
  return r.rows.map(row => ({
    placeId: row.place_id,
    displayName: row.name,
    mostRecent: row.most_recent,
  }));
}

// ─── features ───────────────────────────────────────────────────────────────

export async function featureCount(): Promise<number> {
  const r = await db.execute<CountRow>(
    sql`SELECT COUNT(*) as count FROM features`
  );
  return parseInt(r.rows[0].count);
}

export async function featureCountByDatasetAndType(
  datasetId: string,
  recordType: string
): Promise<number> {
  const r = await db.execute<CountRow>(sql`
    SELECT COUNT(*) as count FROM features
    WHERE dataset_id = ${datasetId} AND record_type = ${recordType}
  `);
  return parseInt(r.rows[0].count);
}

/** Total features of a record type — ground truth for the getFeatures/heatmap recordType filter. */
export async function featureCountByRecordType(recordType: string): Promise<number> {
  const r = await db.execute<CountRow>(
    sql`SELECT COUNT(*) as count FROM features WHERE record_type = ${recordType}`
  );
  return parseInt(r.rows[0].count);
}

/** Total features in a dataset — ground truth for the datasetIds filter. */
export async function featureCountByDataset(datasetId: string): Promise<number> {
  const r = await db.execute<CountRow>(
    sql`SELECT COUNT(*) as count FROM features WHERE dataset_id = ${datasetId}`
  );
  return parseInt(r.rows[0].count);
}

export async function featureUrlsByDataset(datasetId: string): Promise<string[]> {
  const r = await db.execute<{ url: string }>(
    sql`SELECT url FROM features WHERE dataset_id = ${datasetId}`
  );
  return r.rows.map((row) => row.url);
}

export async function firstFeatureDateRange(
  datasetId: string
): Promise<{ startDate: string; endDate: string }> {
  const r = await db.execute<{ start_date: string; end_date: string }>(sql`
    SELECT start_date, end_date FROM features
    WHERE dataset_id = ${datasetId} LIMIT 1
  `);
  return { startDate: r.rows[0].start_date, endDate: r.rows[0].end_date };
}

export async function firstFeatureEntity(datasetId: string): Promise<Entity> {
  const r = await db.execute<{ entity: Entity }>(sql`
    SELECT entity FROM features WHERE dataset_id = ${datasetId} LIMIT 1
  `);
  return r.rows[0].entity;
}

export async function orphanedFeatureCount(): Promise<number> {
  const r = await db.execute<CountRow>(sql`
    SELECT COUNT(*) as count FROM features f
    WHERE NOT EXISTS (SELECT 1 FROM feature_to_place fp WHERE fp.feature_id = f.id)
  `);
  return parseInt(r.rows[0].count);
}

// ─── datasets / record types (ground truth for metadata + label assertions) ───

export async function recordTypeList(): Promise<string[]> {
  const r = await db.execute<{ record_type: string }>(
    sql`SELECT DISTINCT record_type FROM features WHERE record_type IS NOT NULL ORDER BY record_type`
  );
  return r.rows.map(x => x.record_type);
}

export async function datasetIdList(): Promise<string[]> {
  const r = await db.execute<{ id: string }>(sql`SELECT id FROM datasets ORDER BY id`);
  return r.rows.map(x => x.id);
}

export async function datasetLabel(datasetId: string): Promise<string> {
  const r = await db.execute<{ label: string }>(
    sql`SELECT label FROM datasets WHERE id = ${datasetId}`
  );
  return r.rows[0].label;
}

export async function organisationLabelForDataset(datasetId: string): Promise<string> {
  const r = await db.execute<{ label: string }>(sql`
    SELECT o.label FROM datasets d JOIN organisations o ON d.organisation_id = o.id
    WHERE d.id = ${datasetId}
  `);
  return r.rows[0].label;
}

// ─── rebuild-index outputs ──────────────────────────────────────────────────

export async function featuredPlacesMissingSpatialFrequencyCount(): Promise<number> {
  const r = await db.execute<CountRow>(sql`
    SELECT COUNT(*) as count FROM place_geometry pg
    WHERE pg.spatial_frequency IS NULL
      AND EXISTS (SELECT 1 FROM feature_to_place fp WHERE fp.place_id = pg.place_id)
  `);
  return parseInt(r.rows[0].count);
}

export async function placesWithMatchingSpatialFrequencyCount(): Promise<number> {
  const r = await db.execute<{ matches: string }>(sql`
    SELECT COUNT(*) as matches FROM place_geometry pg
    WHERE pg.spatial_frequency = (
      SELECT COUNT(*) FROM place_cells pc WHERE pc.place_id = pg.place_id
    )
    AND EXISTS (SELECT 1 FROM feature_to_place fp WHERE fp.place_id = pg.place_id)
  `);
  return parseInt(r.rows[0].matches);
}

export async function featuredPlaceCount(): Promise<number> {
  const r = await db.execute<CountRow>(sql`
    SELECT COUNT(DISTINCT fp.place_id) as count FROM feature_to_place fp
  `);
  return parseInt(r.rows[0].count);
}

export async function firstFeatureTemporalFrequency(datasetId: string): Promise<number> {
  const r = await db.execute<{ temporal_frequency: number }>(sql`
    SELECT temporal_frequency FROM features
    WHERE dataset_id = ${datasetId} LIMIT 1
  `);
  return r.rows[0].temporal_frequency;
}

// ─── test setup helpers ─────────────────────────────────────────────────────

/** Find any feature whose date range crosses a bin boundary at the given size. */
export async function findFeatureSpanningMultipleBins(
  binSize: number
): Promise<{ id: string; startDate: string; endDate: string } | null> {
  const r = await db.execute<{ id: string; start_date: string; end_date: string }>(sql`
    SELECT id, start_date, end_date FROM features
    WHERE (EXTRACT(YEAR FROM end_date) / ${binSize})::int
        > (EXTRACT(YEAR FROM start_date) / ${binSize})::int
    LIMIT 1
  `);
  if (r.rows.length === 0) return null;
  return {
    id: r.rows[0].id,
    startDate: r.rows[0].start_date,
    endDate: r.rows[0].end_date,
  };
}