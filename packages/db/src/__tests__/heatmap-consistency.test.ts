/**
 * Regression: the heatmap hover count and the per-cell feature-list total must
 * agree for every display cell.
 *
 * The bug this guards against: a place spanning several 100m base cells (a street
 * or polygon) was counted once *per base cell* by the heatmap (it SUMmed each
 * base cell's COUNT(DISTINCT) into the display cell) but once *per display cell*
 * by getFeatures. A street folded into one coarse display cell therefore reported
 * e.g. 9 on hover but 3 on click.
 *
 * The fix makes both sides share one base->display partition:
 *   heatmap:     display = floor(cell * gridN / (maxN + 1))   (COUNT DISTINCT per display cell)
 *   getFeatures: cell ∈ [ceil(col*(maxN+1)/gridN), ceil((col+1)*(maxN+1)/gridN) - 1]
 *
 * This file owns an isolated controlled scenario (its own DB lifecycle). Bun runs
 * test files sequentially with per-file module isolation, so its truncate/seed
 * does not collide with pipeline.test.ts.
 */
import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { sql } from 'drizzle-orm';
import { setupTestDb, cleanTestDb, teardownTestDb, db } from './setup';
import type { HeatmapDimensions, Heatmap } from '@atm/shared';

import { getFeatures } from '../queries/features';
import { getHeatmap, getHeatmapTimeline } from '../queries/heatmap';

const SLICE = '1900_1950';
const RES = { rows: 4, cols: 4 }; // coarse: several street base cells fold into one display cell
// Box larger than the data extent — getFeatures clamps it to the full grid.
const ALL_BOUNDS = { minLon: 4.0, maxLon: 5.5, minLat: 52.0, maxLat: 52.5 };

/**
 * Replicates the frontend's calculateCellBounds (app/lib/utils/heatmap.ts) so a
 * heatmap display cell resolves to the exact bounds the UI sends to /api/features.
 */
function cellBounds(index: number, dim: HeatmapDimensions) {
  const col = index % dim.colsAmount;
  const row = Math.floor(index / dim.colsAmount);
  const cellWidth = (dim.maxLon - dim.minLon) / dim.colsAmount;
  const cellHeight = (dim.maxLat - dim.minLat) / dim.rowsAmount;
  const minLon = dim.minLon + col * cellWidth;
  const minLat = dim.minLat + row * cellHeight;
  return {
    minLon,
    minLat,
    maxLon: col === dim.colsAmount - 1 ? dim.maxLon : minLon + cellWidth,
    maxLat: row === dim.rowsAmount - 1 ? dim.maxLat : minLat + cellHeight
  };
}

/** Every populated heatmap cell's count must equal getFeatures' total for it. */
async function assertCellsMatch(h: Heatmap, dim: HeatmapDimensions) {
  expect(h.indices.length).toBeGreaterThan(0);
  for (let i = 0; i < h.indices.length; i++) {
    const bounds = cellBounds(h.indices[i], dim);
    const feats = await getFeatures({ bounds, recordTypes: ['image'], timeSlice: SLICE, pageSize: 1 });
    expect(feats.total).toBe(h.counts[i]);
  }
}

describe('heatmap ↔ features cell-count consistency', () => {
  beforeAll(async () => {
    await setupTestDb();
    await cleanTestDb();

    await db.execute(sql`INSERT INTO organisations (id, label) VALUES ('test-org', 'Test Org')`);
    await db.execute(sql`INSERT INTO datasets (id, label, organisation_id) VALUES ('test-ds', 'Test DS', 'test-org')`);

    // A street spanning ~6 base cells (500m line) + two point addresses elsewhere.
    await db.execute(sql`
      INSERT INTO place (id, type, geometry) VALUES
        ('street-1', 'street',  ST_GeomFromText('LINESTRING(121000 486000, 121500 486000)', 28992)),
        ('addr-1',   'address', ST_GeomFromText('POINT(122000 486500)', 28992)),
        ('addr-2',   'address', ST_GeomFromText('POINT(121200 485800)', 28992))
    `);

    // 3 features on the street, 1 on each address — all dated within slice 1900_1950.
    await db.execute(sql`
      INSERT INTO features (id, record_type, label, start_date, end_date, dataset_id) VALUES
        ('11111111-1111-1111-1111-111111111101', 'image', 'street-f1', '1925-01-01', '1925-12-31', 'test-ds'),
        ('11111111-1111-1111-1111-111111111102', 'image', 'street-f2', '1925-01-01', '1925-12-31', 'test-ds'),
        ('11111111-1111-1111-1111-111111111103', 'image', 'street-f3', '1925-01-01', '1925-12-31', 'test-ds'),
        ('11111111-1111-1111-1111-111111111104', 'image', 'addr1-f1',  '1925-01-01', '1925-12-31', 'test-ds'),
        ('11111111-1111-1111-1111-111111111105', 'image', 'addr2-f1',  '1925-01-01', '1925-12-31', 'test-ds')
    `);
    await db.execute(sql`
      INSERT INTO feature_to_place (feature_id, place_id) VALUES
        ('11111111-1111-1111-1111-111111111101', 'street-1'),
        ('11111111-1111-1111-1111-111111111102', 'street-1'),
        ('11111111-1111-1111-1111-111111111103', 'street-1'),
        ('11111111-1111-1111-1111-111111111104', 'addr-1'),
        ('11111111-1111-1111-1111-111111111105', 'addr-2')
    `);

    const { rebuildIndex } = await import('../etl/post-process/rebuild-index');
    await rebuildIndex();
  });

  afterAll(async () => {
    await cleanTestDb();
    await teardownTestDb();
  });

  test('street place spans multiple base cells (so the double-count path is exercised)', async () => {
    const r = await db.execute<{ spatial_frequency: number }>(
      sql`SELECT spatial_frequency FROM place WHERE id = 'street-1'`
    );
    expect(r.rows[0].spatial_frequency).toBeGreaterThan(1);
  });

  test('getHeatmapTimeline cell counts equal getFeatures totals (production heatmap path)', async () => {
    const tl = await getHeatmapTimeline(RES, ['image']);
    await assertCellsMatch(tl.timeline[SLICE], tl.dimensions);
  });

  test('getHeatmap single-slice cell counts equal getFeatures totals', async () => {
    const hm = await getHeatmap(SLICE, RES, ['image']);
    await assertCellsMatch(hm.timeline[SLICE], hm.dimensions);
  });

  test('a multi-cell street counts its features once per display cell, not once per base cell', async () => {
    const tl = await getHeatmapTimeline(RES, ['image']);
    const h = tl.timeline[SLICE];
    // The folded street cell holds its 3 features once — not 3 × (its base cells).
    // Old SUM-based code reported 3 per base cell, so a street cell read 6–9.
    expect(Math.max(...h.counts)).toBe(3);
    // The whole dataset still has exactly 5 distinct features (clamped full-extent query).
    const all = await getFeatures({ bounds: ALL_BOUNDS, recordTypes: ['image'], timeSlice: SLICE, pageSize: 50 });
    expect(all.total).toBe(5);
  });
});
