import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { sql } from 'drizzle-orm';
import * as schema from '../schema';

const TEST_DB_URL = process.env.TEST_DATABASE_URL || 'postgresql://test:test@localhost:5434/test';

let pool: Pool;
let db: ReturnType<typeof drizzle>;

export function getTestDb() {
  if (!db) {
    pool = new Pool({ connectionString: TEST_DB_URL });
    db = drizzle(pool, { schema });
  }
  return db;
}

export async function setupTestDb() {
  const testDb = getTestDb();

  // Enable PostGIS
  await testDb.execute(sql`CREATE EXTENSION IF NOT EXISTS postgis`);

  // Push schema tables
  await testDb.execute(sql`
    CREATE TABLE IF NOT EXISTS organisations (
      id TEXT PRIMARY KEY,
      label TEXT NOT NULL,
      description TEXT,
      url TEXT
    )
  `);
  await testDb.execute(sql`
    CREATE TABLE IF NOT EXISTS datasets (
      id TEXT PRIMARY KEY,
      label TEXT NOT NULL,
      description TEXT,
      url TEXT,
      organisation_id TEXT REFERENCES organisations(id)
    )
  `);
  await testDb.execute(sql`
    CREATE TABLE IF NOT EXISTS place (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      current_address TEXT,
      geometry geometry(Geometry, 28992)
    )
  `);
  await testDb.execute(sql`
    CREATE TABLE IF NOT EXISTS address (
      id TEXT PRIMARY KEY,
      place_id TEXT NOT NULL REFERENCES place(id),
      name TEXT,
      date DATE,
      source TEXT
    )
  `);
  await testDb.execute(sql`
    CREATE TABLE IF NOT EXISTS relation (
      id TEXT PRIMARY KEY,
      label TEXT NOT NULL
    )
  `);
  await testDb.execute(sql`
    CREATE TABLE IF NOT EXISTS tags (
      id TEXT PRIMARY KEY,
      label TEXT NOT NULL
    )
  `);
  await testDb.execute(sql`
    CREATE TABLE IF NOT EXISTS features (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      url TEXT,
      record_type TEXT NOT NULL,
      label TEXT NOT NULL,
      description TEXT,
      content_url TEXT,
      start_date DATE,
      end_date DATE,
      dataset_id TEXT REFERENCES datasets(id),
      spatial_frequency INTEGER,
      temporal_frequency INTEGER,
      entity JSONB
    )
  `);
  await testDb.execute(sql`
    CREATE TABLE IF NOT EXISTS feature_to_place (
      feature_id UUID NOT NULL REFERENCES features(id),
      place_id TEXT NOT NULL REFERENCES place(id),
      relation_id TEXT REFERENCES relation(id),
      PRIMARY KEY (feature_id, place_id)
    )
  `);
  await testDb.execute(sql`
    CREATE TABLE IF NOT EXISTS feature_tags (
      feature_id UUID NOT NULL REFERENCES features(id),
      tag_id TEXT NOT NULL REFERENCES tags(id),
      PRIMARY KEY (feature_id, tag_id)
    )
  `);
  await testDb.execute(sql`
    CREATE TABLE IF NOT EXISTS feature_cells (
      feature_id UUID NOT NULL REFERENCES features(id),
      cell_x SMALLINT NOT NULL,
      cell_y SMALLINT NOT NULL,
      PRIMARY KEY (feature_id, cell_x, cell_y)
    )
  `);
}

export async function cleanTestDb() {
  const testDb = getTestDb();
  await testDb.execute(sql`TRUNCATE feature_cells, feature_tags, feature_to_place, features, address, place, relation, datasets, organisations CASCADE`);
}

export async function teardownTestDb() {
  if (pool) await pool.end();
}

export async function seedTestData() {
  const testDb = getTestDb();

  await testDb.execute(sql`INSERT INTO organisations (id, label) VALUES ('test-org', 'Test Org') ON CONFLICT DO NOTHING`);
  await testDb.execute(sql`INSERT INTO datasets (id, label, organisation_id) VALUES ('test-dataset', 'Test Dataset', 'test-org') ON CONFLICT DO NOTHING`);
  await testDb.execute(sql`INSERT INTO relation (id, label) VALUES ('isAbout', 'Is About') ON CONFLICT DO NOTHING`);

  // Place with RD geometry (Amsterdam center-ish)
  await testDb.execute(sql`
    INSERT INTO place (id, type, current_address, geometry)
    VALUES ('lp-1', 'address', 'Prins Hendrikkade 93', ST_Transform(ST_GeomFromText('POINT(4.9 52.37)', 4326), 28992))
    ON CONFLICT DO NOTHING
  `);

  // Historical addresses
  await testDb.execute(sql`INSERT INTO address (id, place_id, name, date, source) VALUES ('addr-1832', 'lp-1', 'Wijk F 439', '1832-01-01', 'percelen-1832') ON CONFLICT DO NOTHING`);
  await testDb.execute(sql`INSERT INTO address (id, place_id, name, date, source) VALUES ('addr-1909', 'lp-1', 'Prins Hendrikkade 93', '1909-01-01', 'pw-1909') ON CONFLICT DO NOTHING`);
  await testDb.execute(sql`INSERT INTO address (id, place_id, name, date, source) VALUES ('addr-1943', 'lp-1', 'Prins Hendrikkade 93', '1943-01-01', 'pw-1943') ON CONFLICT DO NOTHING`);

  // Feature spanning 1840-1920 (should appear in multiple bins)
  await testDb.execute(sql`
    INSERT INTO features (id, url, record_type, label, description, start_date, end_date, dataset_id, spatial_frequency, temporal_frequency)
    VALUES ('11111111-1111-1111-1111-111111111111', 'https://example.com/1', 'image', 'Test Image Spanning', 'A test image with a description that is longer than one hundred and twenty eight characters to verify truncation works correctly in the API response mapping', '1840-01-01', '1920-12-31', 'test-dataset', 2, 8)
    ON CONFLICT DO NOTHING
  `);

  // Feature in 1900-1945 (single bin)
  await testDb.execute(sql`
    INSERT INTO features (id, url, record_type, label, start_date, end_date, dataset_id, spatial_frequency, temporal_frequency)
    VALUES ('22222222-2222-2222-2222-222222222222', 'https://example.com/2', 'person', 'Test Person', '1900-01-01', '1945-12-31', 'test-dataset', 1, 5)
    ON CONFLICT DO NOTHING
  `);

  // Feature exactly at 1900 boundary
  await testDb.execute(sql`
    INSERT INTO features (id, url, record_type, label, start_date, end_date, dataset_id, spatial_frequency, temporal_frequency)
    VALUES ('33333333-3333-3333-3333-333333333333', 'https://example.com/3', 'text', 'Test Text at Boundary', '1900-01-01', '1900-12-31', 'test-dataset', 3, 1)
    ON CONFLICT DO NOTHING
  `);

  // Link features to place
  await testDb.execute(sql`INSERT INTO feature_to_place (feature_id, place_id, relation_id) VALUES ('11111111-1111-1111-1111-111111111111', 'lp-1', 'isAbout') ON CONFLICT DO NOTHING`);
  await testDb.execute(sql`INSERT INTO feature_to_place (feature_id, place_id, relation_id) VALUES ('22222222-2222-2222-2222-222222222222', 'lp-1', 'isAbout') ON CONFLICT DO NOTHING`);
  await testDb.execute(sql`INSERT INTO feature_to_place (feature_id, place_id, relation_id) VALUES ('33333333-3333-3333-3333-333333333333', 'lp-1', 'isAbout') ON CONFLICT DO NOTHING`);

  // Feature cells (for heatmap queries)
  await testDb.execute(sql`INSERT INTO feature_cells (feature_id, cell_x, cell_y) VALUES ('11111111-1111-1111-1111-111111111111', 5, 5) ON CONFLICT DO NOTHING`);
  await testDb.execute(sql`INSERT INTO feature_cells (feature_id, cell_x, cell_y) VALUES ('11111111-1111-1111-1111-111111111111', 5, 6) ON CONFLICT DO NOTHING`);
  await testDb.execute(sql`INSERT INTO feature_cells (feature_id, cell_x, cell_y) VALUES ('22222222-2222-2222-2222-222222222222', 5, 5) ON CONFLICT DO NOTHING`);
  await testDb.execute(sql`INSERT INTO feature_cells (feature_id, cell_x, cell_y) VALUES ('33333333-3333-3333-3333-333333333333', 5, 5) ON CONFLICT DO NOTHING`);
}
