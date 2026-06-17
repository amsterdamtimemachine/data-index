/**
 * rebuild-index rasterisation for the compound geometry shapes real data carries
 * (buurten are often MULTIPOLYGON / have enclaves; streets can be MULTILINESTRING).
 * Each case seeds a single featured place — so it alone anchors min_x/min_y — and
 * asserts the cells ST_Intersects keeps vs. drops. Coords use .5 offsets so edges
 * sit inside cells (the only on-origin edge is handled by the gx/gy>=0 floor).
 */
import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { sql } from 'drizzle-orm';
import { setupTestDb, cleanTestDb, teardownTestDb, db } from './setup';
import { upsertSource } from '../etl/helpers';
import { rebuildIndex } from '../etl/post-process/rebuild-index';

let counter = 0;

/** Seed one featured place with `wkt` (RD/28992), rebuild, return its covered cells as "x,y". */
async function cellsForGeometry(wkt: string, type = 'neighbourhood'): Promise<Set<string>> {
  await cleanTestDb();
  await upsertSource({
    organisation: { id: 'geo-org', label: 'Geo Org' },
    dataset: { id: 'geo-ds', label: 'Geo DS' },
    relation: { id: 'isAbout', label: 'Is About' },
  });
  const pid = `geo-${counter}`;
  const fid = `22222222-2222-2222-2222-${String(counter).padStart(12, '0')}`;
  counter++;
  await db.execute(sql`INSERT INTO place (id, type, geometry) VALUES (${pid}, ${type}, ST_GeomFromText(${wkt}, 28992))`);
  await db.execute(sql`INSERT INTO features (id, record_type, label, start_date, end_date, dataset_id)
    VALUES (${fid}, 'image', 'g feat', '1950-01-01', '1950-12-31', 'geo-ds')`);
  await db.execute(sql`INSERT INTO feature_to_place (feature_id, place_id, relation_id) VALUES (${fid}, ${pid}, 'isAbout')`);
  await rebuildIndex();
  const r = await db.execute<{ cell_x: number; cell_y: number }>(
    sql`SELECT cell_x, cell_y FROM place_cells WHERE place_id = ${pid}`
  );
  return new Set(r.rows.map(c => `${c.cell_x},${c.cell_y}`));
}

describe('rebuild-index rasterisation: compound geometries', () => {
  beforeAll(async () => {
    await setupTestDb();
  });
  afterAll(async () => {
    await cleanTestDb();
    await teardownTestDb();
  });

  test('MULTIPOLYGON fills each part, leaving the gap between them empty', async () => {
    // Part A in cell (0,0); part B (300m east, with a >0 gap to the cell-2 edge) in cell (3,0).
    const cells = await cellsForGeometry(
      'MULTIPOLYGON(' +
        '((120010.5 485010.5,120090.5 485010.5,120090.5 485090.5,120010.5 485090.5,120010.5 485010.5)),' +
        '((120320.5 485010.5,120390.5 485010.5,120390.5 485090.5,120320.5 485090.5,120320.5 485010.5)))'
    );
    expect(cells.has('0,0')).toBe(true);  // part A
    expect(cells.has('3,0')).toBe(true);  // part B
    expect(cells.has('1,0')).toBe(false); // gap
    expect(cells.has('2,0')).toBe(false); // gap
  });

  test('POLYGON with a hole leaves fully-enclosed cells empty, keeps the ring', async () => {
    // 480m outer (cells 0..4), 200m hole centred so it fully contains exactly cell (2,2).
    const cells = await cellsForGeometry(
      'POLYGON(' +
        '(120010.5 485010.5,120490.5 485010.5,120490.5 485490.5,120010.5 485490.5,120010.5 485010.5),' +
        '(120150.5 485150.5,120350.5 485150.5,120350.5 485350.5,120150.5 485350.5,120150.5 485150.5))'
    );
    expect(cells.has('2,2')).toBe(false); // cell envelope fully inside the hole
    expect(cells.has('0,0')).toBe(true);
    expect(cells.has('4,4')).toBe(true);
    expect(cells.has('1,2')).toBe(true);  // straddles the hole edge → still filled
    expect(cells.has('2,1')).toBe(true);
  });

  test('MULTILINESTRING covers each segment, leaving the gap row empty', async () => {
    // Two horizontal lines: row 0 (on the origin edge) and row 2 (mid-cell); row 1 untouched.
    const cells = await cellsForGeometry(
      'MULTILINESTRING(' +
        '(120030.5 485050.5,120270.5 485050.5),' +
        '(120030.5 485280.5,120270.5 485280.5))',
      'street'
    );
    for (const c of ['0,0', '1,0', '2,0', '0,2', '1,2', '2,2']) expect(cells.has(c)).toBe(true);
    for (const c of ['0,1', '1,1', '2,1']) expect(cells.has(c)).toBe(false);
  });
});
