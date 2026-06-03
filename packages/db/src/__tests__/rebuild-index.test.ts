/**
 * Regression: rebuild-index must FILL polygon places, not just trace their outline.
 *
 * The old cell population walked geometry vertices (ST_DumpPoints + ST_Segmentize),
 * so a polygon only got its boundary cells — interior cells were missing and a
 * neighbourhood rendered as a hollow ring. rebuild-index now rasterises each
 * geometry onto the grid (keep a cell if it intersects the geometry), filling polygons.
 */
import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { sql } from 'drizzle-orm';
import { setupTestDb, cleanTestDb, teardownTestDb, db } from './setup';
import { upsertSource } from '../etl/helpers';
import { rebuildIndex } from '../etl/post-process/rebuild-index';

const POLY_ID = 'poly-fill';
const FID = '11111111-1111-1111-1111-1111111111aa';

describe('rebuild-index polygon fill', () => {
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
});
