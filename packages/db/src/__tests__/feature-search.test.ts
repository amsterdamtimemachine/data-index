/**
 * Feature text search (dutch FTS over the title, the description and the entity's
 * searchable fields) and its bitmap integration: websearch semantics (stemming,
 * phrase, OR, exclusion, stopwords), the searchable scope, heatmap/histogram counts
 * intersected with the search set, composition with category filters, the bestMatch
 * sort lane, and the hit explained for the card. The cross-validation test pins
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
const F5 = '22222222-2222-2222-2222-222222222205'; // a person born in Zaandam, person 1900 @P1
const F6 = '22222222-2222-2222-2222-222222222206'; // a programme at the Odeon with a film on the programme, event 1950 @P2

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
      provider: { id: 'fs-org', label: 'FS Org' },
      dataset: { id: 'fs-ds', label: 'FS DS' },
      relations: [{ id: 'isAbout', label: 'Is About' }],
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
      INSERT INTO features (id, record_type, label, start_date, end_date, dataset_id, entity) VALUES
        (${F5}, 'person', 'Sara Polak', '1900-01-01', '1900-12-31', 'fs-ds',
          ${JSON.stringify({ type: 'Person', name: 'Sara Polak', birthPlace: 'Zaandam' })}::jsonb),
        (${F6}, 'event', 'Programma', '1950-01-01', '1950-12-31', 'fs-ds',
          ${JSON.stringify({ type: 'ScreeningEvent', name: 'Programma', startDate: '1950', location: { type: 'Place', name: 'Odeon' }, items: [{ type: 'Movie', name: 'De Koning van Thule' }] })}::jsonb)
    `);
    await db.execute(sql`
      INSERT INTO feature_to_place (feature_id, place_id, relation_id) VALUES
        (${F1}, ${P1}, 'isAbout'), (${F2}, ${P2}, 'isAbout'),
        (${F3}, ${P1}, 'isAbout'), (${F4}, ${P2}, 'isAbout'),
        (${F5}, ${P1}, 'isAbout'), (${F6}, ${P2}, 'isAbout')
    `);

    await rebuildIndex();
  });

  afterAll(async () => {
    await cleanTestDb();
    await teardownTestDb();
  });

  test('stemming unifies inflections: verkooping matches Verkoopingen', async () => {
    const hist = await getHistogram(undefined, undefined, undefined, 50, undefined, undefined, { searchQuery: 'verkooping' });
    expect(hist.totalFeatures).toBe(3); // F1 + F4 by title, F3 by description
  });

  test('the description is searched: a term present only there matches', async () => {
    const hist = await getHistogram(undefined, undefined, undefined, 50, undefined, undefined, { searchQuery: 'zeedijk' });
    expect(hist.totalFeatures).toBe(2); // F2 by title, F3 by description
  });

  test("the entity's searchable fields are searched: a birthplace, a venue, a film on the programme", async () => {
    const born = await getHistogram(undefined, undefined, undefined, 50, undefined, undefined, { searchQuery: 'zaandam' });
    expect(born.totalFeatures).toBe(1); // F5
    const venue = await getHistogram(undefined, undefined, undefined, 50, undefined, undefined, { searchQuery: 'odeon' });
    expect(venue.totalFeatures).toBe(1); // F6
    const film = await getHistogram(undefined, undefined, undefined, 50, undefined, undefined, { searchQuery: '"koning van thule"' });
    expect(film.totalFeatures).toBe(1); // F6
  });

  test('websearch exclusion: -amsterdam drops the Amsterdam verkooping', async () => {
    const hist = await getHistogram(undefined, undefined, undefined, 50, undefined, undefined, { searchQuery: 'verkooping -amsterdam' });
    expect(hist.totalFeatures).toBe(2); // F1, and F3 by its description
  });

  test('websearch phrase: quoted words must be adjacent and in order', async () => {
    const inOrder = await getHistogram(undefined, undefined, undefined, 50, undefined, undefined, { searchQuery: '"nieuwe woningen"' });
    expect(inOrder.totalFeatures).toBe(1); // F2
    const reversed = await getHistogram(undefined, undefined, undefined, 50, undefined, undefined, { searchQuery: '"woningen nieuwe"' });
    expect(reversed.totalFeatures).toBe(0);
  });

  test('websearch OR: either term matches', async () => {
    const hist = await getHistogram(undefined, undefined, undefined, 50, undefined, undefined, { searchQuery: 'verkooping OR zeedijk' });
    expect(hist.totalFeatures).toBe(4); // F1, F4 (stemmed), F2, and F3 by its description
  });

  test('a stopword-only query matches nothing', async () => {
    const hist = await getHistogram(undefined, undefined, undefined, 50, undefined, undefined, { searchQuery: 'de van het' });
    expect(hist.totalFeatures).toBe(0);
    for (const bin of hist.bins) {
      expect(bin.count).toBe(0);
    }
  });

  test('histogram bins carry only matching features, in their bins', async () => {
    const hist = await getHistogram(undefined, undefined, undefined, 50, undefined, undefined, { searchQuery: 'verkooping' });
    const byYear = new Map(hist.bins.map(b => [b.timeSlice.startYear, b.count]));
    expect(byYear.get(1900)).toBe(2); // F1 + F4
    expect(byYear.get(1950) ?? 0).toBe(1); // F3, by its description
  });

  test('heatmap timeline counts are intersected with the search set', async () => {
    const unfiltered = await getHeatmapTimeline({ cols: 50 }, undefined, undefined, undefined, 50);
    const filtered = await getHeatmapTimeline({ cols: 50 }, undefined, undefined, undefined, 50, { searchQuery: 'zeedijk' });
    expect(timelineSum(unfiltered.timeline)).toBe(6);
    expect(timelineSum(filtered.timeline)).toBe(2); // F2's cell and F3's
  });

  test('no matches yields an empty (all-sparse) heatmap timeline', async () => {
    const res = await getHeatmapTimeline({ cols: 50 }, undefined, undefined, undefined, 50, { searchQuery: 'xyzonzin' });
    expect(timelineSum(res.timeline)).toBe(0);
    for (const heatmap of Object.values(res.timeline)) {
      expect(heatmap.indices.length).toBe(0);
    }
  });

  test('search composes with category filters', async () => {
    const hist = await getHistogram(['image'], undefined, undefined, 50, undefined, undefined, { searchQuery: 'verkooping' });
    expect(hist.totalFeatures).toBe(1); // F4 is text, filtered out
  });

  test('cross-validation: bitmap-intersected count equals a live DISTINCT count', async () => {
    const hist = await getHistogram(undefined, undefined, undefined, 50, undefined, undefined, { searchQuery: 'verkooping' });
    const live = await db.execute<{ n: string }>(sql`
      SELECT COUNT(DISTINCT f.id) AS n
      FROM features f
      WHERE f.search_tsv @@ websearch_to_tsquery('dutch', 'verkooping')
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
    expect(res.total).toBe(3);
    const labels = res.data.map(f => f.label);
    // F1 matches both OR terms in its title, F4 one, F3 one in its description — ts_rank with the weights
    expect(labels).toEqual(['Verkooping van het huis', 'Verkoopingen te Amsterdam', 'Onopvallend gebouw']);
  });

  test('getFeatures count and page agree under a search filter', async () => {
    const bounds = await fullBounds();
    const res = await getFeatures({
      area: { kind: 'bounds', bounds },
      searchQuery: 'zeedijk',
      pageSize: 10
    });
    expect(res.total).toBe(2);
    expect(res.data.map((f) => f.id).sort()).toEqual([F2, F3]);
  });

  test('bestMatch: a title hit outranks a description hit', async () => {
    const bounds = await fullBounds();
    const res = await getFeatures({ area: { kind: 'bounds', bounds }, searchQuery: 'zeedijk', sort: 'bestMatch', pageSize: 10 });
    expect(res.data.map((f) => f.id)).toEqual([F2, F3]);
  });

  test('each listed hit says which values matched, with the matching words marked', async () => {
    const bounds = await fullBounds();
    const byField = async (q: string) => {
      const res = await getFeatures({ area: { kind: 'bounds', bounds }, searchQuery: q, pageSize: 10 });
      return Object.fromEntries(res.data.map((f) => [f.id, f.foundBy]));
    };
    const zeedijk = await byField('zeedijk');
    expect(zeedijk[F2]).toEqual([{ field: 'title', text: 'Nieuwe woningen aan de \u0001Zeedijk\u0002' }]);
    expect(zeedijk[F3]).toEqual([{ field: 'description', text: '\u0001zeedijk\u0002 verkooping' }]);
    const odeon = await byField('odeon');
    expect(odeon[F6]).toEqual([{ field: '$.location.name', text: '\u0001Odeon\u0002' }]);
    const film = await byField('koning');
    expect(film[F6]).toEqual([{ field: '$.items[*].name', text: 'De \u0001Koning\u0002 van Thule' }]);
    const none = await getFeatures({ area: { kind: 'bounds', bounds }, pageSize: 10 });
    expect(none.data.every((f) => f.foundBy === undefined)).toBe(true);
  });
});
