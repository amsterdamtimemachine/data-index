/**
 * Tag query coverage (previously untested): availability counts + record types,
 * AND-combination discovery, and incremental combination validation. Also exercises
 * the recordTypes / placeTypes filters these share with the rest of the API.
 *
 * Fixture (4 features, 3 tags):
 *   F1 image  @address       → Nature, Water
 *   F2 image  @address       → Nature, Transport
 *   F3 text   @street        → Water
 *   F4 person @neighbourhood → Transport
 */
import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { sql } from 'drizzle-orm';
import { setupTestDb, cleanTestDb, teardownTestDb, db } from './setup';
import { upsertSource } from '../etl/helpers/helpers';
import { getAvailableTags, getTagCombinations, validateTagCombination } from '../queries/tags';

const F1 = '55555555-5555-5555-5555-555555555501';
const F2 = '55555555-5555-5555-5555-555555555502';
const F3 = '55555555-5555-5555-5555-555555555503';
const F4 = '55555555-5555-5555-5555-555555555504';

/** name → stats, so assertions don't depend on the (tie-broken) sort order. */
function byName<T extends { name: string }>(tags: T[]): Map<string, T> {
  return new Map(tags.map(t => [t.name, t]));
}

describe('tag queries', () => {
  beforeAll(async () => {
    await setupTestDb();
    await cleanTestDb();
    await upsertSource({
      organisation: { id: 'tg-org', label: 'TG Org' },
      dataset: { id: 'tg-ds', label: 'TG DS' },
      relation: { id: 'isAbout', label: 'Is About' },
    });

    await db.execute(sql`
      INSERT INTO place (id, type) VALUES
        ('tp-addr',  'address'),
        ('tp-street','street'),
        ('tp-nbhd',  'neighbourhood')
    `);
    await db.execute(sql`
      INSERT INTO place_geometry (place_id, geometry) VALUES
        ('tp-addr',  ST_SetSRID(ST_MakePoint(120000.5, 485000.5), 28992)),
        ('tp-street',ST_GeomFromText('LINESTRING(120100.5 485000.5, 120200.5 485000.5)', 28992)),
        ('tp-nbhd',  ST_GeomFromText('POLYGON((120300.5 485000.5,120400.5 485000.5,120400.5 485100.5,120300.5 485100.5,120300.5 485000.5))', 28992))
    `);
    await db.execute(sql`
      INSERT INTO features (id, record_type, label, start_date, end_date, dataset_id) VALUES
        (${F1}, 'image',  'F1', '1950-01-01', '1950-12-31', 'tg-ds'),
        (${F2}, 'image',  'F2', '1950-01-01', '1950-12-31', 'tg-ds'),
        (${F3}, 'text',   'F3', '1950-01-01', '1950-12-31', 'tg-ds'),
        (${F4}, 'person', 'F4', '1950-01-01', '1950-12-31', 'tg-ds')
    `);
    await db.execute(sql`
      INSERT INTO feature_to_place (feature_id, place_id, relation_id) VALUES
        (${F1}, 'tp-addr',   'isAbout'),
        (${F2}, 'tp-addr',   'isAbout'),
        (${F3}, 'tp-street', 'isAbout'),
        (${F4}, 'tp-nbhd',   'isAbout')
    `);
    await db.execute(sql`INSERT INTO tags (id, label) VALUES ('nature','Nature'), ('transport','Transport'), ('water','Water')`);
    await db.execute(sql`
      INSERT INTO feature_tags (feature_id, tag_id) VALUES
        (${F1}, 'nature'), (${F1}, 'water'),
        (${F2}, 'nature'), (${F2}, 'transport'),
        (${F3}, 'water'),
        (${F4}, 'transport')
    `);
  });

  afterAll(async () => {
    await cleanTestDb();
    await teardownTestDb();
  });

  test('getAvailableTags returns per-tag feature counts and record types', async () => {
    const { tags } = await getAvailableTags();
    const m = byName(tags);
    expect(m.size).toBe(3);
    expect(m.get('Nature')?.totalFeatures).toBe(2);
    expect(m.get('Transport')?.totalFeatures).toBe(2);
    expect(m.get('Water')?.totalFeatures).toBe(2);
    expect(new Set(m.get('Nature')?.recordTypes)).toEqual(new Set(['image']));
    expect(new Set(m.get('Transport')?.recordTypes)).toEqual(new Set(['image', 'person']));
    expect(new Set(m.get('Water')?.recordTypes)).toEqual(new Set(['image', 'text']));
  });

  test('getAvailableTags honours the recordTypes filter', async () => {
    const { tags } = await getAvailableTags(['text']);
    const m = byName(tags);
    expect(m.size).toBe(1); // only F3 (text) carries a tag
    expect(m.get('Water')?.totalFeatures).toBe(1);
  });

  test('getAvailableTags honours the placeTypes filter', async () => {
    const { tags } = await getAvailableTags(undefined, undefined, ['street']);
    const m = byName(tags);
    expect(m.size).toBe(1); // only F3 sits on a street
    expect(m.get('Water')?.totalFeatures).toBe(1);
  });

  test('getTagCombinations finds tags co-occurring with the selection (AND logic)', async () => {
    const { availableTags } = await getTagCombinations(undefined, undefined, undefined, ['Nature']);
    const m = byName(availableTags);
    // Features with Nature = F1, F2 → their other tags are Water (F1) and Transport (F2), once each.
    expect(m.size).toBe(2);
    expect(m.get('Water')?.totalFeatures).toBe(1);
    expect(m.get('Transport')?.totalFeatures).toBe(1);
    expect(m.has('Nature')).toBe(false); // the selected tag isn't offered back
  });

  test('validateTagCombination flags a pair with no shared feature', async () => {
    // No feature carries both Water and Transport.
    const r = await validateTagCombination(undefined, undefined, undefined, ['Water', 'Transport']);
    expect(r.validTags).toEqual(['Water']);
    expect(r.invalidTags).toEqual(['Transport']);
  });

  test('validateTagCombination accepts a pair that shares a feature', async () => {
    // F1 carries both Nature and Water.
    const r = await validateTagCombination(undefined, undefined, undefined, ['Nature', 'Water']);
    expect(new Set(r.validTags)).toEqual(new Set(['Nature', 'Water']));
    expect(r.invalidTags).toEqual([]);
  });
});
