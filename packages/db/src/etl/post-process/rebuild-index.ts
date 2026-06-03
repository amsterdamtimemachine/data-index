import { sql } from 'drizzle-orm';
import { CELL_SIZE_METERS } from '@atm/shared';
import { db } from '../../client';
import { place, features, featureToPlace, placeCells, gridConfig } from '../../schema';

type BBoxRow = {
  min_x: number;
  min_y: number;
  max_x: number;
  max_y: number };

type StatsRow = {
  total_rows: string;
  unique_places: string;
  unique_cells: string;
  min_x: number;
  max_x: number;
  min_y: number;
  max_y: number;
};

export async function rebuildIndex() {
  console.log('=== Rebuilding place_cells at 100m resolution ===\n');

  // Get bounds from places that have features linked (in RD coordinates)
  const bbox = await db.execute<BBoxRow>(sql`
    SELECT
      ST_XMin(ST_Extent(p.geometry)) as min_x,
      ST_YMin(ST_Extent(p.geometry)) as min_y,
      ST_XMax(ST_Extent(p.geometry)) as max_x,
      ST_YMax(ST_Extent(p.geometry)) as max_y
    FROM ${place} p
    WHERE EXISTS (SELECT 1 FROM ${featureToPlace} fp WHERE fp.place_id = p.id)
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
  console.log('Clearing existing place_cells...');
  await db.execute(sql`TRUNCATE ${placeCells}`);

  // Populate place_cells. Points and lines keep the proven dumppoints path; only
  // polygons need the fill below.
  console.log('Populating place_cells...');
  const t = Date.now();

  const halfCell = CELL_SIZE_METERS / 2;

  // Points & lines: walk densified vertices — a point lands in one cell, a line in
  // every cell it crosses.
  const lineResult = await db.execute(sql`
    INSERT INTO place_cells (place_id, cell_x, cell_y)
    SELECT DISTINCT
      p.id as place_id,
      FLOOR((ST_X((dp).geom) - ${min_x}) / ${CELL_SIZE_METERS})::smallint as cell_x,
      FLOOR((ST_Y((dp).geom) - ${min_y}) / ${CELL_SIZE_METERS})::smallint as cell_y
    FROM ${place} p
    CROSS JOIN LATERAL ST_DumpPoints(ST_Segmentize(p.geometry, ${halfCell})) dp
    WHERE GeometryType(p.geometry) IN ('POINT', 'MULTIPOINT', 'LINESTRING', 'MULTILINESTRING')
      AND EXISTS (SELECT 1 FROM ${featureToPlace} fp WHERE fp.place_id = p.id)
  `);

  // Polygons: rasterise/fill — keep every grid cell whose rectangle intersects the
  // polygon, so the interior is covered, not just the boundary ring. (ST_DumpPoints
  // walked only edge vertices, leaving polygon interiors empty.) The grid origin and
  // cell size are cast to float8 so the cell-envelope arithmetic stays floating point.
  const polyResult = await db.execute(sql`
    WITH featured AS (
      SELECT p.id, p.geometry
      FROM ${place} p
      WHERE p.geometry IS NOT NULL
        AND GeometryType(p.geometry) NOT IN ('POINT', 'MULTIPOINT', 'LINESTRING', 'MULTILINESTRING')
        AND EXISTS (SELECT 1 FROM ${featureToPlace} fp WHERE fp.place_id = p.id)
    )
    INSERT INTO place_cells (place_id, cell_x, cell_y)
    SELECT f.id, gx::smallint, gy::smallint
    FROM featured f
    CROSS JOIN LATERAL generate_series(
      FLOOR((ST_XMin(f.geometry) - ${min_x}::float8) / ${CELL_SIZE_METERS}::float8)::int,
      FLOOR((ST_XMax(f.geometry) - ${min_x}::float8) / ${CELL_SIZE_METERS}::float8)::int
    ) AS gx
    CROSS JOIN LATERAL generate_series(
      FLOOR((ST_YMin(f.geometry) - ${min_y}::float8) / ${CELL_SIZE_METERS}::float8)::int,
      FLOOR((ST_YMax(f.geometry) - ${min_y}::float8) / ${CELL_SIZE_METERS}::float8)::int
    ) AS gy
    WHERE ST_Intersects(
      f.geometry,
      ST_MakeEnvelope(
        ${min_x}::float8 + gx * ${CELL_SIZE_METERS}::float8,
        ${min_y}::float8 + gy * ${CELL_SIZE_METERS}::float8,
        ${min_x}::float8 + (gx + 1) * ${CELL_SIZE_METERS}::float8,
        ${min_y}::float8 + (gy + 1) * ${CELL_SIZE_METERS}::float8,
        28992
      )
    )
  `);

  const rowCount = (lineResult.rowCount ?? 0) + (polyResult.rowCount ?? 0);
  console.log(`✅ Inserted ${rowCount} rows in ${Date.now() - t}ms`);

  // Update spatial frequency on place (number of cells each place spans)
  console.log('Updating spatial frequency...');
  const spatialResult = await db.execute(sql`
    UPDATE ${place} p
    SET spatial_frequency = sub.cell_count
    FROM (
      SELECT place_id, COUNT(*) as cell_count
      FROM ${placeCells}
      GROUP BY place_id
    ) sub
    WHERE p.id = sub.place_id
  `);
  console.log(`  ✅ ${spatialResult.rowCount} places updated`);

  // Update temporal frequency on features (number of base time bins each feature spans)
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
  type CountRow = { total: string; missing_temporal: string };
  type PlaceCountRow = { total_places: string; missing_spatial: string };
  const [featureCoverage, placeCoverage] = await Promise.all([
    db.execute<CountRow>(sql`
      SELECT COUNT(*) as total,
        COUNT(*) - COUNT(temporal_frequency) as missing_temporal
      FROM ${features}
    `),
    db.execute<PlaceCountRow>(sql`
      SELECT COUNT(*) as total_places,
        COUNT(*) - COUNT(spatial_frequency) as missing_spatial
      FROM ${place}
      WHERE EXISTS (SELECT 1 FROM ${featureToPlace} fp WHERE fp.place_id = ${place}.id)
    `)
  ]);
  const { total, missing_temporal } = featureCoverage.rows[0];
  const { total_places, missing_spatial } = placeCoverage.rows[0];

  if (parseInt(missing_spatial) > 0) {
    console.log(`  ⚠ ${missing_spatial}/${total_places} featured places have no spatial frequency`);
  }
  if (parseInt(missing_temporal) > 0) {
    console.log(`  ⚠ ${missing_temporal}/${total} features have no temporal frequency (missing start_date or end_date)`);
  }

  // Summary
  const stats = await db.execute<StatsRow>(sql`
    SELECT
      COUNT(*) as total_rows,
      COUNT(DISTINCT ${placeCells.placeId}) as unique_places,
      COUNT(DISTINCT (${placeCells.cellX}, ${placeCells.cellY})) as unique_cells,
      MIN(${placeCells.cellX}) as min_x, MAX(${placeCells.cellX}) as max_x,
      MIN(${placeCells.cellY}) as min_y, MAX(${placeCells.cellY}) as max_y
    FROM ${placeCells}
  `);
  const s = stats.rows[0];

  // Pre-compute grid bounds for fast query-time lookup
  console.log('\nPre-computing grid bounds...');
  type BoundsRow = { min_lon: string; max_lon: string; min_lat: string; max_lat: string };
  type MaxFreqRow = { max_spatial: string; max_temporal: string };

  const [boundsResult, freqResult] = await Promise.all([
    db.execute<BoundsRow>(sql`
      SELECT
        ST_XMin(ST_Extent(ST_Transform(p.geometry, 4326)))::text as min_lon,
        ST_XMax(ST_Extent(ST_Transform(p.geometry, 4326)))::text as max_lon,
        ST_YMin(ST_Extent(ST_Transform(p.geometry, 4326)))::text as min_lat,
        ST_YMax(ST_Extent(ST_Transform(p.geometry, 4326)))::text as max_lat
      FROM ${placeCells} pc
      JOIN ${place} p ON pc.place_id = p.id
    `),
    db.execute<MaxFreqRow>(sql`
      SELECT
        COALESCE(MAX(p.spatial_frequency), 1)::text as max_spatial,
        COALESCE(MAX(f.temporal_frequency), 1)::text as max_temporal
      FROM ${features} f
      JOIN ${featureToPlace} fp ON f.id = fp.feature_id
      JOIN ${place} p ON fp.place_id = p.id
    `)
  ]);

  const bounds = boundsResult.rows[0];
  const freq = freqResult.rows[0];

  await db.insert(gridConfig)
    .values({
      id: 'current',
      minCellX: s.min_x,
      maxCellX: s.max_x,
      minCellY: s.min_y,
      maxCellY: s.max_y,
      minLon: parseFloat(bounds.min_lon),
      maxLon: parseFloat(bounds.max_lon),
      minLat: parseFloat(bounds.min_lat),
      maxLat: parseFloat(bounds.max_lat),
      maxSpatialFrequency: parseInt(freq.max_spatial),
      maxTemporalFrequency: parseInt(freq.max_temporal),
    })
    .onConflictDoUpdate({
      target: gridConfig.id,
      set: {
        minCellX: s.min_x,
        maxCellX: s.max_x,
        minCellY: s.min_y,
        maxCellY: s.max_y,
        minLon: parseFloat(bounds.min_lon),
        maxLon: parseFloat(bounds.max_lon),
        minLat: parseFloat(bounds.min_lat),
        maxLat: parseFloat(bounds.max_lat),
        maxSpatialFrequency: parseInt(freq.max_spatial),
        maxTemporalFrequency: parseInt(freq.max_temporal),
      }
    });
  console.log('  ✅ Grid config updated');

  console.log(`\n=== Summary ===`);
  console.log(`  Features:         ${total}`);
  console.log(`  Places indexed:   ${s.unique_places}`);
  console.log(`  Cell assignments: ${s.total_rows}`);
  console.log(`  Unique cells:     ${s.unique_cells}`);
  console.log(`  Grid range:       x[${s.min_x}–${s.max_x}] y[${s.min_y}–${s.max_y}]`);
  console.log(`  Geo bounds:       lon[${bounds.min_lon}–${bounds.max_lon}] lat[${bounds.min_lat}–${bounds.max_lat}]`);
  console.log(`  Max frequencies:  spatial=${freq.max_spatial} temporal=${freq.max_temporal}`);
  console.log(`  Temporal coverage: ${parseInt(total) - parseInt(missing_temporal)}/${total} features`);
}
