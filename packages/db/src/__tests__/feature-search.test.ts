/**
 * Feature text search (dutch FTS over labels) and its bitmap integration:
 * websearch semantics (stemming, exclusion, stopwords), label-only scope,
 * heatmap/histogram counts intersected with the search set, composition with
 * category filters, and the bestMatch sort lane. The cross-validation test pins
 * the surrogate mapping end to end: bitmap-intersected counts must equal a live
 * count(DISTINCT) over the same predicate.
 */
import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { sql } from 'drizzle-orm';
import type { Heatmap } from '@atm/shared';
import { setupTestDb, cleanTestDb, teardownTestDb, db } from './setup';
import { upsertSource } from '../etl/writers/feature-writer';
import { rebuildIndex } from '../etl/post-process/rebuild-index';
import { getHeatmapTimeline } from '../queries/heatmap';
import { getHistogram } from '../queries/histogram';
import { getFeatures } from '../queries/features';
import { getGridConfig } from '../queries/grid-config';

const P1 = 'fs-place-1';
const P2 = 'fs-place-2';
const F1 = '22222222-2222-2222-2222-222222222201'; // 'Verkooping van het huis'    image 1900 @P1
const F2 = '22222222-2222-2222-2222-222222222202'; // 'Nieuwe woningen aan de Zeedijk' image 1950 @P2
const F3 = '22222222-2222-2222-2222-222222222203'; // matching text only in description, text 1950 @P1
const F4 = '22222222-2222-2222-2222-222222222204'; // 'Verkoopingen te Amsterdam' text 1900 @P2

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

describe('feature text search', () => {
  beforeAll(async () => {
    await setupTestDb();
    await cleanTestDb();
    await upsertSource({
      organisation: { id: 'fs-org', label: 'FS Org' },
      dataset: { id: 'fs-ds', label: 'FS DS' },
      relation: { id: 'isAbout', label: 'Is About' },
    });

    await db.execute(sql`INSERT INTO place (id, type) VALUES (${P1}, 'address'), (${P2}, 'address')`);
    await db.execute(sql`
      INSERT INTO place_geometry (place_id, geometry) VALUES
        (${P1}, ST_GeomFromText('POINT(120000.5 485000.5)', 28992)),
        (${P2}, ST_GeomFromText('POINT(121000.5 486000.5)', 28992))
    `);

    await db.execute(sql`
      INSERT INTO features (id, record_type, label, description, start_date, end_date, dataset_id) VALUES
        (${F1}, 'image', 'Verkooping van het huis', NULL, '1900-01-01', '1900-12-31', 'fs-ds'),
        (${F2}, 'image', 'Nieuwe woningen aan de Zeedijk', NULL, '1950-01-01', '1950-12-31', 'fs-ds'),
        (${F3}, 'text', 'Onopvallend gebouw', 'zeedijk verkooping', '1950-01-01', '1950-12-31', 'fs-ds'),
        (${F4}, 'text', 'Verkoopingen te Amsterdam', NULL, '1900-01-01', '1900-12-31', 'fs-ds')
    `);
    await db.execute(sql`
      INSERT INTO feature_to_place (feature_id, place_id, relation_id) VALUES
        (${F1}, ${P1}, 'isAbout'), (${F2}, ${P2}, 'isAbout'),
        (${F3}, ${P1}, 'isAbout'), (${F4}, ${P2}, 'isAbout')
    `);

    await rebuildIndex();
  });

  afterAll(async () => {
    await cleanTestDb();
    await teardownTestDb();
  });

  test('stemming unifies inflections: verkooping matches Verkoopingen', async () => {
    const hist = await getHistogram(undefined, undefined, undefined, 50, undefined, undefined, 'verkooping');
    expect(hist.totalFeatures).toBe(2); // F1 + F4, not F3 (description is out of scope)
  });

  test('search is label-only: a term present only in a description does not match', async () => {
    const hist = await getHistogram(undefined, undefined, undefined, 50, undefined, undefined, 'zeedijk');
    expect(hist.totalFeatures).toBe(1); // F2 only, F3 excluded
  });

  test('websearch exclusion: -amsterdam drops the Amsterdam verkooping', async () => {
    const hist = await getHistogram(undefined, undefined, undefined, 50, undefined, undefined, 'verkooping -amsterdam');
    expect(hist.totalFeatures).toBe(1); // F1
  });

  test('a stopword-only query matches nothing', async () => {
    const hist = await getHistogram(undefined, undefined, undefined, 50, undefined, undefined, 'de van het');
    expect(hist.totalFeatures).toBe(0);
    for (const bin of hist.bins) {
      expect(bin.count).toBe(0);
    }
  });

  test('histogram bins carry only matching features, in their bins', async () => {
    const hist = await getHistogram(undefined, undefined, undefined, 50, undefined, undefined, 'verkooping');
    const byYear = new Map(hist.bins.map(b => [b.timeSlice.startYear, b.count]));
    expect(byYear.get(1900)).toBe(2); // F1 + F4
    expect(byYear.get(1950) ?? 0).toBe(0); // F2/F3 don't match
  });

  test('heatmap timeline counts are intersected with the search set', async () => {
    const unfiltered = await getHeatmapTimeline({ cols: 50 }, undefined, undefined, undefined, 50);
    const filtered = await getHeatmapTimeline({ cols: 50 }, undefined, undefined, undefined, 50, 'zeedijk');
    expect(timelineSum(unfiltered.timeline)).toBe(4);
    expect(timelineSum(filtered.timeline)).toBe(1); // F2's cell only
  });

  test('no matches yields an empty (all-sparse) heatmap timeline', async () => {
    const res = await getHeatmapTimeline({ cols: 50 }, undefined, undefined, undefined, 50, 'xyzonzin');
    expect(timelineSum(res.timeline)).toBe(0);
    for (const heatmap of Object.values(res.timeline)) {
      expect(heatmap.indices.length).toBe(0);
    }
  });

  test('search composes with category filters', async () => {
    const hist = await getHistogram(['image'], undefined, undefined, 50, undefined, undefined, 'verkooping');
    expect(hist.totalFeatures).toBe(1); // F4 is text, filtered out
  });

  test('cross-validation: bitmap-intersected count equals a live DISTINCT count', async () => {
    const hist = await getHistogram(undefined, undefined, undefined, 50, undefined, undefined, 'verkooping');
    const live = await db.execute<{ n: string }>(sql`
      SELECT COUNT(DISTINCT f.id) AS n
      FROM features f
      WHERE f.label_tsv @@ websearch_to_tsquery('dutch', 'verkooping')
        AND EXISTS (
          SELECT 1 FROM feature_to_place fp
          JOIN place_cells pc ON pc.place_id = fp.place_id
          WHERE fp.feature_id = f.id
        )
    `);
    expect(hist.totalFeatures).toBe(parseInt(live.rows[0].n));
  });

  test('getFeatures filters by searchQuery and bestMatch ranks by match quality', async () => {
    const bounds = await fullBounds();
    const res = await getFeatures({
      area: { kind: 'bounds', bounds },
      searchQuery: 'verkooping OR huis',
      sort: 'bestMatch',
      pageSize: 10
    });
    expect(res.total).toBe(2);
    const labels = res.data.map(f => f.label);
    // F1 matches both OR terms, F4 one — ts_rank puts F1 first
    expect(labels).toEqual(['Verkooping van het huis', 'Verkoopingen te Amsterdam']);
  });

  test('getFeatures count and page agree under a search filter', async () => {
    const bounds = await fullBounds();
    const res = await getFeatures({
      area: { kind: 'bounds', bounds },
      searchQuery: 'zeedijk',
      pageSize: 10
    });
    expect(res.total).toBe(1);
    expect(res.data.length).toBe(1);
    expect(res.data[0].id).toBe(F2);
  });
});
