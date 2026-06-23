/**
 * Regression: re-ingesting a source must be idempotent (a "fix the file and
 * re-run" workflow), not duplicate rows.
 *
 *  - features carry a deterministic id (featureUuid(datasetId, key)), so a re-ingest upserts
 *    the existing row instead of inserting a copy with a fresh random id.
 *  - a corrected place assignment replaces the feature's old link rather than
 *    accumulating a second one (link reconciliation).
 *  - insertPlaces conflict modes: 'geometry' refreshes geometry but preserves the
 *    adressen-owned name; 'replace' refreshes label + geometry.
 *
 * Isolated DB lifecycle (its own seed); bun runs test files sequentially but shares
 * module singletons process-wide (the pg pool AND the query caches), so teardownTestDb
 * leaves the pool open and the suite relies on CACHE_TTL_MINUTES=0 to disable caching
 * (otherwise one file's cached time-slices leak into the next).
 */
import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { sql } from 'drizzle-orm';
import { setupTestDb, cleanTestDb, teardownTestDb, db } from './setup';
import { featureUuid, createFeatureWriter, insertPlaces, upsertSource } from '../etl/helpers';
import type { PlaceIdRow } from '../row-types';

async function placeRow(id: string) {
  const r = await db.execute<{ label: string | null; x: number }>(
    sql`SELECT p.name as label, ST_X(g.geometry) as x
        FROM place p JOIN place_geometry g ON g.place_id = p.id WHERE p.id = ${id}`
  );
  return r.rows[0];
}

async function featureCountByUrl(url: string) {
  const r = await db.execute<{ n: string }>(sql`SELECT COUNT(*) n FROM features WHERE url = ${url}`);
  return parseInt(r.rows[0].n);
}

async function linkedPlaces(featureId: string) {
  const r = await db.execute<PlaceIdRow>(
    sql`SELECT place_id FROM feature_to_place WHERE feature_id = ${featureId} ORDER BY place_id`
  );
  return r.rows.map(x => x.place_id);
}

describe('ETL idempotency', () => {
  beforeAll(async () => {
    await setupTestDb();
    await cleanTestDb();
    await upsertSource({
      organisation: { id: 'idem-org', label: 'Idem Org' },
      dataset: { id: 'idem-ds', label: 'Idem DS' },
      relation: { id: 'isAbout', label: 'Is About' },
    });
  });

  afterAll(async () => {
    await cleanTestDb();
    await teardownTestDb();
  });

  test('featureUuid is deterministic, key-specific, and a valid v5 UUID', () => {
    expect(featureUuid('ds', '1')).toBe(featureUuid('ds', '1'));
    expect(featureUuid('ds', '1')).not.toBe(featureUuid('ds', '2'));
    expect(featureUuid('ds', '1')).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
    );
  });

  test('featureUuid namespaces by dataset — same key in different datasets does not collide', () => {
    expect(featureUuid('delpher', '32235')).not.toBe(featureUuid('joods-monument', '32235'));
  });

  test("insertPlaces 'geometry' updates geometry but preserves name", async () => {
    const id = 'idem-geo';
    await insertPlaces([{ id, type: 'address', label: 'Original Label', wkt: 'POINT(100000 480000)' }],
      { sourceSrid: 28992, onConflict: 'replaceAll' });
    // Re-ingest: no label, moved point, geometry-only conflict.
    await insertPlaces([{ id, type: 'address', label: null, wkt: 'POINT(100500 480500)' }],
      { sourceSrid: 28992, onConflict: 'replaceGeometry' });

    const row = await placeRow(id);
    expect(row.label).toBe('Original Label');          // preserved
    expect(Math.round(Number(row.x))).toBe(100500);    // geometry updated
  });

  test("insertPlaces 'replace' updates label and geometry", async () => {
    const id = 'idem-replace';
    await insertPlaces([{ id, type: 'street', label: 'Old Name', wkt: 'POINT(100000 480000)' }],
      { sourceSrid: 28992, onConflict: 'replaceAll' });
    await insertPlaces([{ id, type: 'street', label: 'New Name', wkt: 'POINT(100500 480500)' }],
      { sourceSrid: 28992, onConflict: 'replaceAll' });

    const row = await placeRow(id);
    expect(row.label).toBe('New Name');
    expect(Math.round(Number(row.x))).toBe(100500);
  });

  test('re-ingesting a corrected feature updates in place and moves its link (no duplicate)', async () => {
    await insertPlaces([
      { id: 'idem-A', type: 'address', label: 'A', wkt: 'POINT(101000 481000)' },
      { id: 'idem-B', type: 'address', label: 'B', wkt: 'POINT(102000 482000)' },
    ], { sourceSrid: 28992, onConflict: 'replaceAll' });

    const url = 'https://example.org/feature/1';
    const id = featureUuid('idem-ds', url);

    // Run 1: feature v1 linked to A.
    const w1 = createFeatureWriter();
    w1.addFeature({ id, url, recordType: 'image', label: 'v1', datasetId: 'idem-ds' });
    w1.addLink({ featureId: id, placeId: 'idem-A', relationId: 'isAbout' });
    await w1.flush();

    expect(await featureCountByUrl(url)).toBe(1);
    expect(await linkedPlaces(id)).toEqual(['idem-A']);

    // Run 2: corrected file — same url (so same id), new label, linked to B instead.
    const w2 = createFeatureWriter();
    w2.addFeature({ id, url, recordType: 'image', label: 'v2-corrected', datasetId: 'idem-ds' });
    w2.addLink({ featureId: id, placeId: 'idem-B', relationId: 'isAbout' });
    await w2.flush();

    expect(await featureCountByUrl(url)).toBe(1);                       // no duplicate
    const updated = await db.execute<{ label: string }>(sql`SELECT label FROM features WHERE id = ${id}`);
    expect(updated.rows[0].label).toBe('v2-corrected');                // content updated in place
    expect(await linkedPlaces(id)).toEqual(['idem-B']);                // link moved A -> B, no stale A
  });
});
