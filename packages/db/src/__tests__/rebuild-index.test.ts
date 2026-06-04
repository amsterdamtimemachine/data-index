/**
 * Regression: rebuild-index rasterises lines and polygons onto the grid via
 * ST_Intersects (keep a cell if it intersects the geometry).
 *
 * - Polygons are FILLED (interior included), not just their boundary ring — the old
 *   ST_DumpPoints walked only edge vertices, leaving interiors empty (a hollow ring).
 * - Lines get every cell they cross (also exact; dumppoints could miss brief clips).
 */
import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { sql } from 'drizzle-orm';
import { setupTestDb, cleanTestDb, teardownTestDb, db } from './setup';
import { upsertSource } from '../etl/helpers';
import { rebuildIndex } from '../etl/post-process/rebuild-index';

const POLY_ID = 'poly-fill';
const LINE_ID = 'line-cover';
const FID = '11111111-1111-1111-1111-1111111111aa';
const FID2 = '11111111-1111-1111-1111-1111111111bb';

describe('rebuild-index line + polygon rasterisation', () => {
  beforeAll(async () => {
    await setupTestDb();
    await cleanTestDb();
    await upsertSource({
      organisation: { id: 'ri-org', label: 'RI Org' },
      dataset: { id: 'ri-ds', label: 'RI DS' },
      relation: { id: 'isAbout', label: 'Is About' },
    });
    // A 280m square with fractional corners (so the test also exercises float8
    // cell-origin arithmetic, not just integer coords). As the only featured place
    // it anchors min_x/min_y to its own corner → a 3x3 block of 100m cells (0..2).
    await db.execute(sql`
      INSERT INTO place (id, type, geometry) VALUES (${POLY_ID}, 'neighbourhood',
        ST_GeomFromText('POLYGON((120000.5 485000.5, 120280.5 485000.5, 120280.5 485280.5, 120000.5 485280.5, 120000.5 485000.5))', 28992))
    `);
    await db.execute(sql`
      INSERT INTO features (id, record_type, label, start_date, end_date, dataset_id)
      VALUES (${FID}, 'image', 'poly feature', '1950-01-01', '1950-12-31', 'ri-ds')
    `);
    await db.execute(sql`INSERT INTO feature_to_place (feature_id, place_id, relation_id) VALUES (${FID}, ${POLY_ID}, 'isAbout')`);

    // A line up-and-right of the polygon (so it doesn't move the min_x/min_y anchor),
    // mid-cell endpoints → it crosses exactly 3 cells in one row: (10,10),(11,10),(12,10).
    await db.execute(sql`
      INSERT INTO place (id, type, geometry) VALUES (${LINE_ID}, 'street',
        ST_GeomFromText('LINESTRING(121030.5 486050.5, 121270.5 486050.5)', 28992))
    `);
    await db.execute(sql`
      INSERT INTO features (id, record_type, label, start_date, end_date, dataset_id)
      VALUES (${FID2}, 'image', 'line feature', '1950-01-01', '1950-12-31', 'ri-ds')
    `);
    await db.execute(sql`INSERT INTO feature_to_place (feature_id, place_id, relation_id) VALUES (${FID2}, ${LINE_ID}, 'isAbout')`);

    await rebuildIndex();
  });

  afterAll(async () => {
    await cleanTestDb();
    await teardownTestDb();
  });

  test('polygon interior is filled (3x3 incl. centre), not just the boundary ring', async () => {
    const cells = await db.execute<{ cell_x: number; cell_y: number }>(
      sql`SELECT cell_x, cell_y FROM place_cells WHERE place_id = ${POLY_ID}`
    );
    const set = new Set(cells.rows.map(r => `${r.cell_x},${r.cell_y}`));
    for (let x = 0; x <= 2; x++) for (let y = 0; y <= 2; y++) {
      expect(set.has(`${x},${y}`)).toBe(true);
    }
    expect(set.has('1,1')).toBe(true); // the interior cell the boundary-only approach omitted
    expect(cells.rows.length).toBe(9);
  });

  test('spatial_frequency reflects the filled cell count', async () => {
    const r = await db.execute<{ spatial_frequency: number }>(
      sql`SELECT spatial_frequency FROM place WHERE id = ${POLY_ID}`
    );
    expect(r.rows[0].spatial_frequency).toBe(9);
  });

  test('line is assigned every cell it crosses', async () => {
    const cells = await db.execute<{ cell_x: number; cell_y: number }>(
      sql`SELECT cell_x, cell_y FROM place_cells WHERE place_id = ${LINE_ID}`
    );
    const set = new Set(cells.rows.map(r => `${r.cell_x},${r.cell_y}`));
    expect(cells.rows.length).toBe(3);
    for (const c of ['10,10', '11,10', '12,10']) expect(set.has(c)).toBe(true);
  });
});
