/**
 * placeTypes filter coverage. The heatmap, feature list and histogram all accept
 * a placeTypes triple (address | street | neighbourhood) — the user-facing way to
 * restrict the map to a geometry kind. Seeds one place of each type (POINT / LINESTRING
 * / POLYGON) with a feature, then asserts each query honours the filter.
 */
import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { sql } from 'drizzle-orm';
import { setupTestDb, cleanTestDb, teardownTestDb, db } from './setup';
import { upsertSource } from '../etl/helpers/helpers';
import { rebuildIndex } from '../etl/post-process/rebuild-index';
import { getFeatures } from '../queries/features';
import { getHistogram } from '../queries/histogram';
import { getHeatmapTimeline } from '../queries/heatmap';

const BOUNDS = { minLon: 4.0, maxLon: 5.5, minLat: 52.0, maxLat: 52.5 };
const F_ADDR = '33333333-3333-3333-3333-3333333333a1';
const F_STREET = '33333333-3333-3333-3333-3333333333b2';
const F_NBHD = '33333333-3333-3333-3333-3333333333c3';
const F_DISTRICT = '33333333-3333-3333-3333-3333333333d4';

describe('placeTypes filter (address / street / neighbourhood / district)', () => {
  beforeAll(async () => {
    await setupTestDb();
    await cleanTestDb();
    await upsertSource({
      organisation: { id: 'pt-org', label: 'PT Org' },
      dataset: { id: 'pt-ds', label: 'PT DS' },
      relation: { id: 'isAbout', label: 'Is About' },
    });

    // One place of each type (RD/28992), all within the Amsterdam WGS84 bounds.
    const places: [string, string, string][] = [
      ['pt-addr', 'address', 'POINT(120050.5 485050.5)'],
      ['pt-street', 'street', 'LINESTRING(120150.5 485050.5, 120250.5 485050.5)'],
      ['pt-nbhd', 'neighbourhood', 'POLYGON((120350.5 485050.5,120450.5 485050.5,120450.5 485150.5,120350.5 485150.5,120350.5 485050.5))'],
      ['pt-district', 'district', 'POLYGON((120550.5 485050.5,120650.5 485050.5,120650.5 485150.5,120550.5 485150.5,120550.5 485050.5))'],
    ];
    for (const [id, type, wkt] of places) {
      await db.execute(sql`INSERT INTO place (id, type) VALUES (${id}, ${type})`);
      await db.execute(sql`INSERT INTO place_geometry (place_id, geometry) VALUES (${id}, ST_GeomFromText(${wkt}, 28992))`);
    }

    // One feature per place, distinct record types so we can tell them apart.
    const feats: [string, string, string, string][] = [
      [F_ADDR, 'image', 'addr feat', 'pt-addr'],
      [F_STREET, 'text', 'street feat', 'pt-street'],
      [F_NBHD, 'person', 'nbhd feat', 'pt-nbhd'],
      [F_DISTRICT, 'image', 'district feat', 'pt-district'],
    ];
    for (const [fid, rt, label, pid] of feats) {
      await db.execute(sql`INSERT INTO features (id, record_type, label, start_date, end_date, dataset_id)
        VALUES (${fid}, ${rt}, ${label}, '1950-01-01', '1950-12-31', 'pt-ds')`);
      await db.execute(sql`INSERT INTO feature_to_place (feature_id, place_id, relation_id) VALUES (${fid}, ${pid}, 'isAbout')`);
    }

    await rebuildIndex();
  });

  afterAll(async () => {
    await cleanTestDb();
    await teardownTestDb();
  });

  test('getFeatures filters to a single place type', async () => {
    const r = await getFeatures({ bounds: BOUNDS, placeTypes: ['street'] });
    expect(r.total).toBe(1);
    expect(r.data.map(f => f.recordType)).toEqual(['text']);
  });

  test('getFeatures honours the district place type (wijk, separate from neighbourhood)', async () => {
    const r = await getFeatures({ bounds: BOUNDS, placeTypes: ['district'] });
    expect(r.total).toBe(1);
    // district and neighbourhood are distinct types — filtering one must not return the other
    const nbhd = await getFeatures({ bounds: BOUNDS, placeTypes: ['neighbourhood'] });
    expect(nbhd.total).toBe(1);
  });

  test('getFeatures accepts multiple place types', async () => {
    const r = await getFeatures({ bounds: BOUNDS, placeTypes: ['address', 'neighbourhood'] });
    expect(r.total).toBe(2);
    expect(new Set(r.data.map(f => f.recordType))).toEqual(new Set(['image', 'person']));
  });

  test('getFeatures without placeTypes returns every type', async () => {
    const r = await getFeatures({ bounds: BOUNDS });
    expect(r.total).toBe(4);
  });

  test('getHistogram totalFeatures respects placeTypes', async () => {
    expect((await getHistogram(undefined, undefined, ['street'])).totalFeatures).toBe(1);
    expect((await getHistogram(undefined, undefined, ['address', 'neighbourhood'])).totalFeatures).toBe(2);
    expect((await getHistogram()).totalFeatures).toBe(4);
  });

  test('getHeatmapTimeline respects placeTypes', async () => {
    const cellsOf = (resp: Awaited<ReturnType<typeof getHeatmapTimeline>>) => {
      const s = new Set<number>();
      for (const h of Object.values(resp.timeline)) for (const i of h.indices) s.add(i);
      return s;
    };
    const all = cellsOf(await getHeatmapTimeline({ cols: 50 }));
    const addrOnly = cellsOf(await getHeatmapTimeline({ cols: 50 }, undefined, undefined, ['address']));
    expect(addrOnly.size).toBeGreaterThan(0);
    expect(addrOnly.size).toBeLessThan(all.size);
    for (const i of addrOnly) expect(all.has(i)).toBe(true);
  });
});
