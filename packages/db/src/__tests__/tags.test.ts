/**
 * Tag filtering on the bitmap path: per-tag counts under the category filters and
 * a search term, heatmap/histogram counts intersected with OR / AND tag sets, an
 * unknown tag matching nothing, composition with the search bitmap, and the
 * feature list's per-row tag predicate. The cross-validation test pins the
 * precomputed bitmaps to a live count over feature_tags.
 *
 * Fixture (4 features, 3 tags, two taggers):
 *   F1 image  @address       → nature, water
 *   F2 image  @address       → nature, transport
 *   F3 text   @street        → water
 *   F4 person @neighbourhood → transport   (also water from a second tagger)
 */
import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { sql } from 'drizzle-orm';
import type { Heatmap } from '@atm/shared';
import { setupTestDb, cleanTestDb, teardownTestDb, db } from './setup';
import { upsertSource } from '../etl/writers/feature-writer';
import { rebuildIndex } from '../etl/post-process/rebuild-index';
import { getAvailableTags } from '../queries/tags';
import { getHistogram } from '../queries/histogram';
import { getHeatmapTimeline } from '../queries/heatmap';
import { getFeatures } from '../queries/features';
import { getGridConfig } from '../queries/grid-config';

const F1 = '55555555-5555-5555-5555-555555555501';
const F2 = '55555555-5555-5555-5555-555555555502';
const F3 = '55555555-5555-5555-5555-555555555503';
const F4 = '55555555-5555-5555-5555-555555555504';

function counts(tags: { id: string; count: number }[]): Record<string, number> {
  return Object.fromEntries(tags.map(t => [t.id, t.count]));
}

function timelineSum(timeline: Record<string, Heatmap>): number {
  let sum = 0;
  for (const heatmap of Object.values(timeline)) {
    for (const count of heatmap.counts) {
      sum += count;
    }
  }
  return sum;
}

async function fullBounds() {
  const cfg = await getGridConfig();
  return { minLon: cfg.minLon, maxLon: cfg.maxLon, minLat: cfg.minLat, maxLat: cfg.maxLat };
}

describe('tag filtering', () => {
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
        (${F1}, 'image',  'Eerste foto',  '1950-01-01', '1950-12-31', 'tg-ds'),
        (${F2}, 'image',  'Tweede foto',  '1950-01-01', '1950-12-31', 'tg-ds'),
        (${F3}, 'text',   'Eerste tekst', '1950-01-01', '1950-12-31', 'tg-ds'),
        (${F4}, 'person', 'Persoon',      '1950-01-01', '1950-12-31', 'tg-ds')
    `);
    await db.execute(sql`
      INSERT INTO feature_to_place (feature_id, place_id, relation_id) VALUES
        (${F1}, 'tp-addr',   'isAbout'),
        (${F2}, 'tp-addr',   'isAbout'),
        (${F3}, 'tp-street', 'isAbout'),
        (${F4}, 'tp-nbhd',   'isAbout')
    `);
    await db.execute(sql`INSERT INTO tags (id, label) VALUES ('nature','nature'), ('transport','transport'), ('water','water')`);
    await db.execute(sql`
      INSERT INTO feature_tags (feature_id, tag_id, source) VALUES
        (${F1}, 'nature', 'a'), (${F1}, 'water', 'a'),
        (${F2}, 'nature', 'a'), (${F2}, 'transport', 'a'),
        (${F3}, 'water', 'a'),
        (${F4}, 'transport', 'a'),
        (${F4}, 'water', 'b')
    `);

    await rebuildIndex();
  });

  afterAll(async () => {
    await cleanTestDb();
    await teardownTestDb();
  });

  test('getAvailableTags counts every tag, unioned over taggers, most common first', async () => {
    const { tags } = await getAvailableTags();
    expect(tags.map(t => t.id)).toEqual(['water', 'nature', 'transport']);
    expect(counts(tags)).toEqual({ water: 3, nature: 2, transport: 2 });
  });

  test('getAvailableTags honours the category filters and keeps zero-count tags', async () => {
    expect(counts((await getAvailableTags(['text'])).tags)).toEqual({ water: 1, nature: 0, transport: 0 });
    expect(counts((await getAvailableTags(undefined, undefined, ['street'])).tags)).toEqual({ water: 1, nature: 0, transport: 0 });
  });

  test('getAvailableTags counts within a search term', async () => {
    expect(counts((await getAvailableTags(undefined, undefined, undefined, 'eerste')).tags))
      .toEqual({ water: 2, nature: 1, transport: 0 }); // F1 + F3
  });

  test('histogram total: OR unions the tag sets', async () => {
    const hist = await getHistogram(undefined, undefined, undefined, 50, undefined, undefined, { tags: ['nature', 'transport'], tagOperator: 'OR' });
    expect(hist.totalFeatures).toBe(3); // F1, F2, F4
  });

  test('histogram total: AND intersects them', async () => {
    const hist = await getHistogram(undefined, undefined, undefined, 50, undefined, undefined, { tags: ['nature', 'water'], tagOperator: 'AND' });
    expect(hist.totalFeatures).toBe(1); // F1
  });

  test('tagOperator defaults to OR', async () => {
    const hist = await getHistogram(undefined, undefined, undefined, 50, undefined, undefined, { tags: ['nature', 'water'] });
    expect(hist.totalFeatures).toBe(4);
  });

  test('an unknown tag matches nothing, alone and inside an AND', async () => {
    const alone = await getHistogram(undefined, undefined, undefined, 50, undefined, undefined, { tags: ['nope'] });
    expect(alone.totalFeatures).toBe(0);
    for (const bin of alone.bins) {
      expect(bin.count).toBe(0);
    }
    const anded = await getHistogram(undefined, undefined, undefined, 50, undefined, undefined, { tags: ['water', 'nope'], tagOperator: 'AND' });
    expect(anded.totalFeatures).toBe(0);
  });

  test('tags compose with the category filters and the search term', async () => {
    const images = await getHistogram(['image'], undefined, undefined, 50, undefined, undefined, { tags: ['water'] });
    expect(images.totalFeatures).toBe(1); // F1 (F3 is text, F4 a person)
    const searched = await getHistogram(undefined, undefined, undefined, 50, undefined, undefined, { searchQuery: 'foto', tags: ['water'] });
    expect(searched.totalFeatures).toBe(1); // F1 (F3 has water but is a tekst)
    const none = await getHistogram(undefined, undefined, undefined, 50, undefined, undefined, { searchQuery: 'persoon', tags: ['nature'] });
    expect(none.totalFeatures).toBe(0);
  });

  test('heatmap timeline counts are intersected with the tag set', async () => {
    const unfiltered = await getHeatmapTimeline({ cols: 50 }, undefined, undefined, undefined, 50);
    const filtered = await getHeatmapTimeline({ cols: 50 }, undefined, undefined, undefined, 50, { tags: ['transport'] });
    expect(timelineSum(unfiltered.timeline)).toBeGreaterThanOrEqual(4);
    // transport = F4's polygon cells (the person features) plus F2 alone in the
    // address cell it shares with F1
    const persons = await getHeatmapTimeline({ cols: 50 }, ['person'], undefined, undefined, 50);
    expect(timelineSum(filtered.timeline)).toBe(timelineSum(persons.timeline) + 1);
    const none = await getHeatmapTimeline({ cols: 50 }, undefined, undefined, undefined, 50, { tags: ['nope'] });
    expect(timelineSum(none.timeline)).toBe(0);
  });

  test('the feature list applies the same tag sets and returns tag ids', async () => {
    const area = { kind: 'bounds' as const, bounds: await fullBounds() };
    const anded = await getFeatures({ area, tags: ['nature', 'water'], tagOperator: 'AND' });
    expect(anded.total).toBe(1);
    expect(anded.data[0].id).toBe(F1);
    expect(anded.data[0].tags).toEqual(['nature', 'water']);

    const ored = await getFeatures({ area, tags: ['nature', 'water'], tagOperator: 'OR' });
    expect(ored.total).toBe(4);

    const none = await getFeatures({ area, tags: ['nope'] });
    expect(none.total).toBe(0);
    expect(none.data).toEqual([]);
  });

  test('cross-validation: bitmap-intersected count equals a live DISTINCT count', async () => {
    const hist = await getHistogram(undefined, undefined, undefined, 50, undefined, undefined, { tags: ['water', 'transport'], tagOperator: 'AND' });
    const live = await db.execute<{ n: string }>(sql`
      SELECT COUNT(*) AS n FROM (
        SELECT ft.feature_id FROM feature_tags ft
        WHERE ft.tag_id IN ('water', 'transport')
        GROUP BY ft.feature_id HAVING COUNT(DISTINCT ft.tag_id) = 2
      ) both_tags
    `);
    expect(hist.totalFeatures).toBe(parseInt(live.rows[0].n));
    expect(hist.totalFeatures).toBe(1); // F4 via the two taggers
  });
});
