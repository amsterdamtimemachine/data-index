import { sql } from 'drizzle-orm';
import { CELL_SIZE_METERS } from '@atm/shared';
import { db } from '../../client';
import { adamlink, features, featureToAdamlink, featureCells } from '../../schema';

// Query result types
type BBoxRow = { min_x: number; min_y: number; max_x: number; max_y: number };
type StatsRow = {
  total_rows: string;
  unique_features: string;
  unique_cells: string;
  min_x: number;
  max_x: number;
  min_y: number;
  max_y: number;
};

export async function rebuildFeatureCells() {
  console.log('=== Rebuilding feature_cells at 100m resolution ===\n');

  // Get actual bounds from data (in RD coordinates - meters)
  const bbox = await db.execute<BBoxRow>(sql`
    SELECT
      ST_XMin(ST_Extent(${adamlink.geometry})) as min_x,
      ST_YMin(ST_Extent(${adamlink.geometry})) as min_y,
      ST_XMax(ST_Extent(${adamlink.geometry})) as max_x,
      ST_YMax(ST_Extent(${adamlink.geometry})) as max_y
    FROM ${adamlink}
  `);
  const { min_x, min_y, max_x, max_y } = bbox.rows[0];

  const width = max_x - min_x;
  const height = max_y - min_y;
  const gridCols = Math.ceil(width / CELL_SIZE_METERS);
  const gridRows = Math.ceil(height / CELL_SIZE_METERS);

  console.log(`Bounds (RD): (${min_x.toFixed(0)}, ${min_y.toFixed(0)}) → (${max_x.toFixed(0)}, ${max_y.toFixed(0)})`);
  console.log(`Extent: ${width.toFixed(0)}m × ${height.toFixed(0)}m`);
  console.log(`Cell size: ${CELL_SIZE_METERS}m`);
  console.log(`Grid dimensions: ${gridCols} × ${gridRows} (max ${gridCols * gridRows} cells)\n`);

  // Clear existing data
  console.log('Clearing existing feature_cells...');
  await db.execute(sql`TRUNCATE ${featureCells}`);

  // Populate feature_cells
  console.log('Populating feature_cells...');
  const t = Date.now();

  // Note: Using sql.raw for the arithmetic expressions since they reference
  // dynamic bounds values that need to be interpolated into the query
  const result = await db.execute(sql`
    INSERT INTO feature_cells (feature_id, cell_x, cell_y)
    SELECT DISTINCT
      ${features.id} as feature_id,
      FLOOR((ST_X(${adamlink.geometry}) - ${min_x}) / ${CELL_SIZE_METERS})::smallint as cell_x,
      FLOOR((ST_Y(${adamlink.geometry}) - ${min_y}) / ${CELL_SIZE_METERS})::smallint as cell_y
    FROM ${features}
    INNER JOIN ${featureToAdamlink} ON ${features.id} = ${featureToAdamlink.featureId}
    INNER JOIN ${adamlink} ON ${featureToAdamlink.adamlinkId} = ${adamlink.id}
  `);

  console.log(`✅ Inserted ${result.rowCount} rows in ${Date.now() - t}ms`);

  // Stats
  const stats = await db.execute<StatsRow>(sql`
    SELECT
      COUNT(*) as total_rows,
      COUNT(DISTINCT ${featureCells.featureId}) as unique_features,
      COUNT(DISTINCT (${featureCells.cellX}, ${featureCells.cellY})) as unique_cells,
      MIN(${featureCells.cellX}) as min_x, MAX(${featureCells.cellX}) as max_x,
      MIN(${featureCells.cellY}) as min_y, MAX(${featureCells.cellY}) as max_y
    FROM ${featureCells}
  `);
  console.log('\nStats:', stats.rows[0]);
}
