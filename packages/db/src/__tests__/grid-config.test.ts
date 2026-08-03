/**
 * grid_config + display-grid derivation coverage (the RD-origin / square-cell work).
 *
 * Seeds a known extent: two address points anchoring an 8 x 4 base-cell grid
 * (maxCellX=7, maxCellY=3), so deriveGrid's rows = round(cols * (maxY+1)/(maxX+1))
 * and the persisted origin are exactly predictable. One describe / one seed — the
 * shared test DB makes multiple seeding/wiping describes in one file step on each
 * other, so the "not built" case lives in its own file. Types come from
 * getGridConfig / getHeatmapTimeline (inferred) — nothing redefined here.
 */
import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { sql } from 'drizzle-orm';
import { setupTestDb, cleanTestDb, teardownTestDb, db } from './setup';
import { upsertSource } from '../etl/helpers/helpers';
import { rebuildIndex } from '../etl/post-process/rebuild-index';
import { getGridConfig } from '../queries/grid-config';
import { getHeatmapTimeline } from '../queries/heatmap';

const ORIGIN_X = 120000.5;
const ORIGIN_Y = 485000.5;
// NE point +750 / +350 metres → cell (7, 3) → maxCellX=7, maxCellY=3 (extent 8 x 4).
const NE_X = ORIGIN_X + 750;
const NE_Y = ORIGIN_Y + 350;
const F1 = '44444444-4444-4444-4444-444444444401';
const F2 = '44444444-4444-4444-4444-444444444402';

describe('grid_config + display-grid derivation', () => {
  beforeAll(async () => {
    await setupTestDb();
    await cleanTestDb();
    await upsertSource({
      organisation: { id: 'gc-org', label: 'GC Org' },
      dataset: { id: 'gc-ds', label: 'GC DS' },
      relation: { id: 'isAbout', label: 'Is About' },
    });
    await db.execute(sql`INSERT INTO place (id, type) VALUES ('gc-sw', 'address'), ('gc-ne', 'address')`);
    await db.execute(sql`INSERT INTO place_geometry (place_id, geometry) VALUES ('gc-sw', ST_SetSRID(ST_MakePoint(${ORIGIN_X}, ${ORIGIN_Y}), 28992)), ('gc-ne', ST_SetSRID(ST_MakePoint(${NE_X}, ${NE_Y}), 28992))`);
    const links: [string, string][] = [[F1, 'gc-sw'], [F2, 'gc-ne']];
    for (const [fid, pid] of links) {
      await db.execute(sql`INSERT INTO features (id, record_type, label, start_date, end_date, dataset_id)
        VALUES (${fid}, 'image', 'f', '1950-01-01', '1950-12-31', 'gc-ds')`);
      await db.execute(sql`INSERT INTO feature_to_place (feature_id, place_id, relation_id) VALUES (${fid}, ${pid}, 'isAbout')`);
    }
    await rebuildIndex();
  });

  afterAll(async () => {
    await cleanTestDb();
    await teardownTestDb();
  });

  // ── grid_config: RD origin + bounds ────────────────────────────────────────

  test('persists the RD/28992 origin (SW corner of the featured-place bbox)', async () => {
    const cfg = await getGridConfig();
    expect(cfg.minX).toBeCloseTo(ORIGIN_X, 5);
    expect(cfg.minY).toBeCloseTo(ORIGIN_Y, 5);
  });

  test('cell-index extent matches the seeded geometry (8 x 4 base cells)', async () => {
    const cfg = await getGridConfig();
    expect(cfg.minCellX).toBe(0);
    expect(cfg.minCellY).toBe(0);
    expect(cfg.maxCellX).toBe(7);
    expect(cfg.maxCellY).toBe(3);
  });

  test('WGS84 bounds are grid-aligned (strict superset of the data envelope, not equal)', async () => {
    const cfg = await getGridConfig();
    const env = await db.execute<{ minlon: number; maxlon: number; minlat: number; maxlat: number }>(sql`
      SELECT ST_XMin(e) AS minlon, ST_XMax(e) AS maxlon, ST_YMin(e) AS minlat, ST_YMax(e) AS maxlat
      FROM (SELECT ST_Extent(ST_Transform(geometry, 4326)) AS e FROM place_geometry) s
    `);
    const d = env.rows[0];
    // Grid = data bbox rounded UP to whole cells, so its WGS84 bbox contains the
    // data envelope and extends strictly past it on the NE (a data-envelope bug
    // would make the NE edges equal, not greater). The SW corner coincides with the
    // data's SW point, so allow a float4-sized epsilon there (grid_config bounds are
    // stored as real); the distinguishing signal is the strict NE extension.
    const EPS = 1e-5;
    expect(cfg.minLon).toBeLessThanOrEqual(d.minlon + EPS);
    expect(cfg.minLat).toBeLessThanOrEqual(d.minlat + EPS);
    expect(cfg.maxLon).toBeGreaterThan(d.maxlon);
    expect(cfg.maxLat).toBeGreaterThan(d.maxlat);
  });

  // ── width-only resolution → square cells ───────────────────────────────────

  test('rows are derived from the aspect ratio: round(cols * (maxY+1)/(maxX+1))', async () => {
    const { dimensions: d } = await getHeatmapTimeline({ cols: 8 });
    expect(d.colsAmount).toBe(8);
    expect(d.rowsAmount).toBe(Math.round((8 * (3 + 1)) / (7 + 1))); // = 4
    expect(d.rowsAmount).toBe(4);
  });

  test('derived cells are square in RD metres, anchored at the RD origin', async () => {
    const { dimensions: d } = await getHeatmapTimeline({ cols: 8 });
    expect(d.rdCellWidth).toBeCloseTo(d.rdCellHeight as number, 6); // 100m x 100m
    expect(d.rdOriginX).toBeCloseTo(ORIGIN_X, 5);
    expect(d.rdOriginY).toBeCloseTo(ORIGIN_Y, 5);
  });

  test('a coarser width still derives proportional rows', async () => {
    const { dimensions: d } = await getHeatmapTimeline({ cols: 4 });
    expect(d.colsAmount).toBe(4);
    expect(d.rowsAmount).toBe(2); // round(4 * 4/8) = 2 → 200m square cells
  });

  test('width above the base resolution clamps to the cell extent', async () => {
    const { dimensions: d } = await getHeatmapTimeline({ cols: 100 });
    expect(d.colsAmount).toBe(8); // clamped to maxCellX+1
    expect(d.rowsAmount).toBe(4); // clamped to maxCellY+1
  });
});
