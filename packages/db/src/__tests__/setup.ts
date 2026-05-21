/**
 * Test DB setup — provides helpers for schema creation, cleanup, and seeding
 * via the actual ingestion scripts on fixture CSVs/JSON.
 * Expects DATABASE_URL and CACHE_TTL_MINUTES=0 to be set by the test script.
 */
import { sql } from 'drizzle-orm';
import { resolve } from 'path';
import { db } from '../client';

export { db };

export const FIXTURES = {
  lps: resolve(__dirname, 'fixtures/lps.csv'),
  adressen: resolve(__dirname, 'fixtures/adressen.csv'),
  beeldbank: resolve(__dirname, 'fixtures/beeldbank.csv'),
  jm: resolve(__dirname, 'fixtures/jm.csv'),
};

export async function setupTestDb() {
  await db.execute(sql`CREATE EXTENSION IF NOT EXISTS postgis`);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS organisations (
      id TEXT PRIMARY KEY, label TEXT NOT NULL, description TEXT, url TEXT
    )
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS datasets (
      id TEXT PRIMARY KEY, label TEXT NOT NULL, description TEXT, url TEXT,
      organisation_id TEXT REFERENCES organisations(id)
    )
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS place (
      id TEXT PRIMARY KEY, type TEXT NOT NULL,
      preferred_label TEXT, geometry geometry(Geometry, 28992)
    )
  `);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_place_geometry ON place USING gist(geometry)`);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS place_name (
      id TEXT PRIMARY KEY, place_id TEXT NOT NULL REFERENCES place(id),
      name TEXT, since DATE, until DATE, source TEXT
    )
  `);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_place_name_place ON place_name(place_id)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_place_name_place_since ON place_name(place_id, since)`);
  await db.execute(sql`CREATE TABLE IF NOT EXISTS relation (id TEXT PRIMARY KEY, label TEXT NOT NULL)`);
  await db.execute(sql`CREATE TABLE IF NOT EXISTS tags (id TEXT PRIMARY KEY, label TEXT NOT NULL)`);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS features (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      url TEXT, record_type TEXT NOT NULL, label TEXT NOT NULL,
      description TEXT, content_url TEXT, start_date DATE, end_date DATE,
      dataset_id TEXT REFERENCES datasets(id),
      spatial_frequency INTEGER, temporal_frequency INTEGER, entity JSONB
    )
  `);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_features_dates ON features(start_date, end_date)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_features_record_type ON features(record_type)`);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS feature_to_place (
      feature_id UUID NOT NULL REFERENCES features(id),
      place_id TEXT NOT NULL REFERENCES place(id),
      relation_id TEXT REFERENCES relation(id),
      PRIMARY KEY (feature_id, place_id)
    )
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS feature_tags (
      feature_id UUID NOT NULL REFERENCES features(id),
      tag_id TEXT NOT NULL REFERENCES tags(id),
      PRIMARY KEY (feature_id, tag_id)
    )
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS feature_cells (
      feature_id UUID NOT NULL REFERENCES features(id),
      cell_x SMALLINT NOT NULL, cell_y SMALLINT NOT NULL,
      PRIMARY KEY (feature_id, cell_x, cell_y)
    )
  `);
}

export async function cleanTestDb() {
  await db.execute(sql`TRUNCATE feature_cells, feature_tags, feature_to_place, features, place_name, place, relation, tags, datasets, organisations CASCADE`);
}

export async function teardownTestDb() {
  const client = (db as any).$client;
  if (client && typeof client.end === 'function') {
    await client.end();
  }
}

/**
 * Seed via real ingestion scripts on fixture data.
 * After this runs, the DB has:
 *  - 15 places (LPS linked points)
 *  - ~50 historical place names (enriched with street names + dates from adressen)
 *  - 5 person features (Joods Monument, 1900-1945)
 *  - ~9 image features (Beeldbank, various dates)
 */
export async function seedTestData() {
  const { ingest: ingestLps } = await import('../etl/sources/lps');
  const { ingest: ingestAdressen } = await import('../etl/sources/adressen');
  const { ingest: ingestBeeldbank } = await import('../etl/sources/beeldbank');
  const { ingest: ingestJm } = await import('../etl/sources/joods-monument');

  await ingestLps(FIXTURES.lps);
  await ingestAdressen(FIXTURES.adressen);
  await ingestBeeldbank(FIXTURES.beeldbank);
  await ingestJm(FIXTURES.jm);
}
