/**
 * Read-only DB inspectors used by integration tests to assert on ingestion +
 * rebuild-index side effects. Each function encapsulates one query and returns
 * a typed value; tests handle the actual `expect()` call.
 *
 * Keeping the SQL out of the test file means the test bodies read like
 * behaviour assertions instead of like database queries.
 */
import { sql } from 'drizzle-orm';
import type { Entity } from '@atm/shared';
import { db } from './setup';

// ─── place ──────────────────────────────────────────────────────────────────

export async function placeCount(): Promise<number> {
  const r = await db.execute<{ count: string }>(
    sql`SELECT COUNT(*) as count FROM place`
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
  const r = await db.execute<{ count: string }>(
    sql`SELECT COUNT(*) as count FROM place WHERE geometry IS NOT NULL`
  );
  return parseInt(r.rows[0].count);
}

// ─── place_name ─────────────────────────────────────────────────────────────

export async function placeNamesWithDanglingPlaceIdCount(): Promise<number> {
  const r = await db.execute<{ count: string }>(sql`
    SELECT COUNT(*) as count FROM place_name pn
    WHERE NOT EXISTS (SELECT 1 FROM place p WHERE p.id = pn.place_id)
  `);
  return parseInt(r.rows[0].count);
}

export async function distinctPlaceNameSources(): Promise<string[]> {
  const r = await db.execute<{ source: string }>(
    sql`SELECT DISTINCT source FROM place_name WHERE source IS NOT NULL`
  );
  return r.rows.map(row => row.source);
}

export async function placeNamesWithNameCount(): Promise<number> {
  const r = await db.execute<{ count: string }>(
    sql`SELECT COUNT(*) as count FROM place_name WHERE name IS NOT NULL`
  );
  return parseInt(r.rows[0].count);
}

export async function placeNamesWithDateCount(): Promise<number> {
  const r = await db.execute<{ count: string }>(
    sql`SELECT COUNT(*) as count FROM place_name WHERE since IS NOT NULL`
  );
  return parseInt(r.rows[0].count);
}

// ─── place ↔ place_name consistency ─────────────────────────────────────────

export interface PlaceCurrentVsMostRecent {
  placeId: string;
  currentAddress: string;
  mostRecent: string;
}

export async function placesWithCurrentAddressAndMostRecent(
  limit: number = 5
): Promise<PlaceCurrentVsMostRecent[]> {
  const r = await db.execute<{ place_id: string; current_address: string; most_recent: string }>(sql`
    SELECT p.id as place_id, p.current_address,
      (SELECT pn.name FROM place_name pn
       WHERE pn.place_id = p.id AND pn.name IS NOT NULL
       ORDER BY pn.since DESC LIMIT 1) as most_recent
    FROM place p
    WHERE p.current_address IS NOT NULL
    LIMIT ${limit}
  `);
  return r.rows.map(row => ({
    placeId: row.place_id,
    currentAddress: row.current_address,
    mostRecent: row.most_recent,
  }));
}

// ─── features ───────────────────────────────────────────────────────────────

export async function featureCount(): Promise<number> {
  const r = await db.execute<{ count: string }>(
    sql`SELECT COUNT(*) as count FROM features`
  );
  return parseInt(r.rows[0].count);
}

export async function featureCountByDatasetAndType(
  datasetId: string,
  recordType: string
): Promise<number> {
  const r = await db.execute<{ count: string }>(sql`
    SELECT COUNT(*) as count FROM features
    WHERE dataset_id = ${datasetId} AND record_type = ${recordType}
  `);
  return parseInt(r.rows[0].count);
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
  const r = await db.execute<{ count: string }>(sql`
    SELECT COUNT(*) as count FROM features f
    WHERE NOT EXISTS (SELECT 1 FROM feature_to_place fp WHERE fp.feature_id = f.id)
  `);
  return parseInt(r.rows[0].count);
}

// ─── rebuild-index outputs ──────────────────────────────────────────────────

export async function featuresMissingSpatialFrequencyCount(): Promise<number> {
  const r = await db.execute<{ count: string }>(
    sql`SELECT COUNT(*) as count FROM features WHERE spatial_frequency IS NULL`
  );
  return parseInt(r.rows[0].count);
}

export async function featuresWithMatchingSpatialFrequencyCount(): Promise<number> {
  const r = await db.execute<{ matches: string }>(sql`
    SELECT COUNT(*) as matches FROM features f
    WHERE f.spatial_frequency = (
      SELECT COUNT(*) FROM feature_cells fc WHERE fc.feature_id = f.id
    )
  `);
  return parseInt(r.rows[0].matches);
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
