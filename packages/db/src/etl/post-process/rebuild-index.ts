import { sql } from 'drizzle-orm';
import { CELL_SIZE_METERS } from '@atm/shared';
import { db } from '../../client';
import { place, features, featureToPlace, featureCells } from '../../schema';

type BBoxRow = { 
  min_x: number; 
  min_y: number; 
  max_x: number; 
  max_y: number };

type StatsRow = {
  total_rows: string;
  unique_features: string;
  unique_cells: string;
  min_x: number;
  max_x: number;
  min_y: number;
  max_y: number;
};

export async function rebuildIndex() {
  console.log('=== Rebuilding feature_cells at 100m resolution ===\n');

  // Get actual bounds from data (in RD coordinates - meters)
  const bbox = await db.execute<BBoxRow>(sql`
    SELECT
      ST_XMin(ST_Extent(${place.geometry})) as min_x,
      ST_YMin(ST_Extent(${place.geometry})) as min_y,
      ST_XMax(ST_Extent(${place.geometry})) as max_x,
      ST_YMax(ST_Extent(${place.geometry})) as max_y
    FROM ${place}
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

  const result = await db.execute(sql`
    INSERT INTO feature_cells (feature_id, cell_x, cell_y)
    SELECT DISTINCT
      ${features.id} as feature_id,
      FLOOR((ST_X(${place.geometry}) - ${min_x}) / ${CELL_SIZE_METERS})::smallint as cell_x,
      FLOOR((ST_Y(${place.geometry}) - ${min_y}) / ${CELL_SIZE_METERS})::smallint as cell_y
    FROM ${features}
    INNER JOIN ${featureToPlace} ON ${features.id} = ${featureToPlace.featureId}
    INNER JOIN ${place} ON ${featureToPlace.placeId} = ${place.id}
  `);

  console.log(`✅ Inserted ${result.rowCount} rows in ${Date.now() - t}ms`);

  // Update spatial frequency (number of cells each feature spans)
  console.log('Updating spatial frequency...');
  const spatialResult = await db.execute(sql`
    UPDATE ${features} f
    SET spatial_frequency = sub.cell_count
    FROM (
      SELECT feature_id, COUNT(*) as cell_count
      FROM ${featureCells}
      GROUP BY feature_id
    ) sub
    WHERE f.id = sub.feature_id
  `);
  console.log(`  ✅ ${spatialResult.rowCount} features updated`);

  // Update temporal frequency (number of base time bins each feature spans)
  const baseBinSize = parseInt(process.env.BASE_BIN_SIZE || '10', 10) || 10;
  console.log(`\nUpdating temporal frequency (base bin: ${baseBinSize} years)...`);
  const temporalResult = await db.execute(sql`
    UPDATE ${features} f
    SET temporal_frequency = GREATEST(1, CEIL(
      (EXTRACT(YEAR FROM f.end_date) - EXTRACT(YEAR FROM f.start_date)) / ${baseBinSize}
    ))
    WHERE f.start_date IS NOT NULL AND f.end_date IS NOT NULL
  `);
  console.log(`  ✅ ${temporalResult.rowCount} features updated`);

  // Check coverage gaps
  type CountRow = { total: string; missing_spatial: string; missing_temporal: string };
  const coverage = await db.execute<CountRow>(sql`
    SELECT
      COUNT(*) as total,
      COUNT(*) - COUNT(spatial_frequency) as missing_spatial,
      COUNT(*) - COUNT(temporal_frequency) as missing_temporal
    FROM ${features}
  `);
  const { total, missing_spatial, missing_temporal } = coverage.rows[0];
  if (parseInt(missing_spatial) > 0) {
    console.log(`  ⚠ ${missing_spatial}/${total} features have no spatial frequency (no linked place with geometry)`);
  }
  if (parseInt(missing_temporal) > 0) {
    console.log(`  ⚠ ${missing_temporal}/${total} features have no temporal frequency (missing start_date or end_date)`);
  }

  // Summary
  const stats = await db.execute<StatsRow>(sql`
    SELECT
      COUNT(*) as total_rows,
      COUNT(DISTINCT ${featureCells.featureId}) as unique_features,
      COUNT(DISTINCT (${featureCells.cellX}, ${featureCells.cellY})) as unique_cells,
      MIN(${featureCells.cellX}) as min_x, MAX(${featureCells.cellX}) as max_x,
      MIN(${featureCells.cellY}) as min_y, MAX(${featureCells.cellY}) as max_y
    FROM ${featureCells}
  `);
  const s = stats.rows[0];

  console.log(`\n=== Summary ===`);
  console.log(`  Features:         ${total}`);
  console.log(`  Cell assignments: ${s.total_rows}`);
  console.log(`  Unique cells:     ${s.unique_cells}`);
  console.log(`  Grid range:       x[${s.min_x}–${s.max_x}] y[${s.min_y}–${s.max_y}]`);
  console.log(`  Spatial coverage:  ${parseInt(total) - parseInt(missing_spatial)}/${total} features`);
  console.log(`  Temporal coverage: ${parseInt(total) - parseInt(missing_temporal)}/${total} features`);
}
