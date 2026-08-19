import { sql } from 'drizzle-orm';
import { PRECOMP_GRID_CELL_METERS, PRECOMP_TIME_BIN_YEARS } from '@atm/shared';
import { db } from '../../client';
import { placeGeometry, features, featureToPlace, placeCells, gridConfig } from '../../schema';
import { buildCellFeatures } from './build-cell-features';
import { yearBin, hasLinkedFeatures, cellIndex, cellEnvelope } from '../sql';
import { datedFeatures } from '../../queries/time-filter';

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
      ST_XMin(ST_Extent(pg.geometry)) as min_x,
      ST_YMin(ST_Extent(pg.geometry)) as min_y,
      ST_XMax(ST_Extent(pg.geometry)) as max_x,
      ST_YMax(ST_Extent(pg.geometry)) as max_y
    FROM ${placeGeometry} pg
    WHERE ${hasLinkedFeatures(sql`pg.place_id`)}
  `);
  const { min_x, min_y, max_x, max_y } = bbox.rows[0];

  const width = max_x - min_x;
  const height = max_y - min_y;
  const gridCols = Math.ceil(width / PRECOMP_GRID_CELL_METERS);
  const gridRows = Math.ceil(height / PRECOMP_GRID_CELL_METERS);

  console.log(`Bounds (RD): (${min_x.toFixed(0)}, ${min_y.toFixed(0)}) → (${max_x.toFixed(0)}, ${max_y.toFixed(0)})`);
  console.log(`Extent: ${width.toFixed(0)}m × ${height.toFixed(0)}m`);
  console.log(`Cell size: ${PRECOMP_GRID_CELL_METERS}m`);
  console.log(`Grid dimensions: ${gridCols} × ${gridRows} (max ${gridCols * gridRows} cells)\n`);

  // Clear existing data
  console.log('Clearing existing place_cells...');
  await db.execute(sql`TRUNCATE ${placeCells}`);

  // Populate place_cells. Points keep the dumppoints path; lines and polygons use the
  // intersect-fill below (exact, and benchmarked faster than dumppoints on streets).
  console.log('Populating place_cells...');
  const t = Date.now();

  // Points: each point lands in exactly one cell.
  const pointResult = await db.execute(sql`
    INSERT INTO place_cells (place_id, cell_x, cell_y)
    SELECT DISTINCT
      pg.place_id as place_id,
      ${cellIndex(sql`ST_X((dp).geom)`, min_x)}::smallint as cell_x,
      ${cellIndex(sql`ST_Y((dp).geom)`, min_y)}::smallint as cell_y
    FROM ${placeGeometry} pg
    CROSS JOIN LATERAL ST_DumpPoints(pg.geometry) dp
    WHERE GeometryType(pg.geometry) IN ('POINT', 'MULTIPOINT')
      AND ${hasLinkedFeatures(sql`pg.place_id`)}
  `);

  // Lines and polygons: rasterise — keep every grid cell whose rectangle intersects
  // the geometry (a line's crossed cells, a polygon's filled interior). Exact, unlike
  // dumppoints (which can miss cells a line briefly clips, and left polygon interiors
  // empty), and benchmarked faster than dumppoints on real street data. Origin and
  // cell size are cast to float8 so the cell-envelope arithmetic stays floating point.
  const fillResult = await db.execute(sql`
    WITH featured AS (
      SELECT pg.place_id as id, pg.geometry
      FROM ${placeGeometry} pg
      WHERE pg.geometry IS NOT NULL
        AND GeometryType(pg.geometry) NOT IN ('POINT', 'MULTIPOINT')
        AND ${hasLinkedFeatures(sql`pg.place_id`)}
    )
    INSERT INTO place_cells (place_id, cell_x, cell_y)
    SELECT f.id, gx::smallint, gy::smallint
    FROM featured f
    CROSS JOIN LATERAL generate_series(
      ${cellIndex(sql`ST_XMin(f.geometry)`, min_x)}::int,
      ${cellIndex(sql`ST_XMax(f.geometry)`, min_x)}::int
    ) AS gx
    CROSS JOIN LATERAL generate_series(
      ${cellIndex(sql`ST_YMin(f.geometry)`, min_y)}::int,
      ${cellIndex(sql`ST_YMax(f.geometry)`, min_y)}::int
    ) AS gy
    WHERE ST_Intersects(f.geometry, ${cellEnvelope(sql`gx`, sql`gy`, min_x, min_y)})
  `);

  const rowCount = (pointResult.rowCount ?? 0) + (fillResult.rowCount ?? 0);
  console.log(`Inserted ${rowCount} rows in ${Date.now() - t}ms`);

  // Update spatial frequency on place_geometry (number of cells each geometry spans)
  console.log('Updating spatial frequency...');
  const spatialResult = await db.execute(sql`
    UPDATE ${placeGeometry} pg
    SET spatial_frequency = sub.cell_count
    FROM (
      SELECT place_id, COUNT(*) as cell_count
      FROM ${placeCells}
      GROUP BY place_id
    ) sub
    WHERE pg.place_id = sub.place_id
  `);
  console.log(`  ${spatialResult.rowCount} places updated`);

  // Update temporal frequency on features: the number of base time bins the feature's
  // range occupies — the same yearBin expansion build-cell-features indexes with, so
  // the frequency counts exactly the bins the feature appears in.
  console.log(`\nUpdating temporal frequency (base bin: ${PRECOMP_TIME_BIN_YEARS} years)...`);
  const temporalResult = await db.execute(sql`
    UPDATE ${features} f
    SET temporal_frequency = GREATEST(1,
      (${yearBin(sql`f.end_date`)} - ${yearBin(sql`f.start_date`)}) / ${PRECOMP_TIME_BIN_YEARS}::int + 1
    )
    WHERE ${datedFeatures(sql`f.start_date`, sql`f.end_date`)}
  `);
  console.log(`  ${temporalResult.rowCount} features updated`);

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
      FROM ${placeGeometry} pg
      WHERE ${hasLinkedFeatures(sql`pg.place_id`)}
    `)
  ]);
  const { total, missing_temporal } = featureCoverage.rows[0];
  const { total_places, missing_spatial } = placeCoverage.rows[0];

  if (parseInt(missing_spatial) > 0) {
    console.log(`  ${missing_spatial}/${total_places} featured places have no spatial frequency`);
  }
  if (parseInt(missing_temporal) > 0) {
    console.log(`  ${missing_temporal}/${total} features have no temporal frequency (missing start_date or end_date)`);
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

  // Pre-compute grid bounds for fast query-time lookup.
  //
  // The display grid the frontend draws must tile the *same* base-cell grid the
  // heatmap counts against. That grid is the RD rectangle anchored at the origin
  // (min_x, min_y) spanning (maxCellX+1) × (maxCellY+1) cells — NOT the data
  // envelope, whose WGS84 corners are different physical points and a slightly
  // different size. We transform that rectangle to WGS84 and store its bbox, so
  // the frontend's linear interpolation lands cells where the counts actually are.
  console.log('\nPre-computing grid bounds...');
  const gridMaxX = min_x + (s.max_x + 1) * PRECOMP_GRID_CELL_METERS;
  const gridMaxY = min_y + (s.max_y + 1) * PRECOMP_GRID_CELL_METERS;
  type BoundsRow = { min_lon: string; max_lon: string; min_lat: string; max_lat: string };
  type MaxFreqRow = { max_spatial: string; max_temporal: string };

  const [boundsResult, freqResult] = await Promise.all([
    db.execute<BoundsRow>(sql`
      WITH grid AS (
        SELECT ST_Transform(
          ST_MakeEnvelope(${min_x}, ${min_y}, ${gridMaxX}, ${gridMaxY}, 28992),
          4326
        ) AS g
      )
      SELECT
        ST_XMin(g)::text as min_lon,
        ST_XMax(g)::text as max_lon,
        ST_YMin(g)::text as min_lat,
        ST_YMax(g)::text as max_lat
      FROM grid
    `),
    db.execute<MaxFreqRow>(sql`
      SELECT
        COALESCE(MAX(pg.spatial_frequency), 1)::text as max_spatial,
        COALESCE(MAX(f.temporal_frequency), 1)::text as max_temporal
      FROM ${features} f
      JOIN ${featureToPlace} fp ON f.id = fp.feature_id
      JOIN ${placeGeometry} pg ON fp.place_id = pg.place_id
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
      minX: min_x,
      minY: min_y,
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
        minX: min_x,
        minY: min_y,
        minLon: parseFloat(bounds.min_lon),
        maxLon: parseFloat(bounds.max_lon),
        minLat: parseFloat(bounds.min_lat),
        maxLat: parseFloat(bounds.max_lat),
        maxSpatialFrequency: parseInt(freq.max_spatial),
        maxTemporalFrequency: parseInt(freq.max_temporal),
      }
    });
  console.log('  Grid config updated');

  // Depends on place_cells, so it has to come after the rasterisation above.
  await buildCellFeatures();

  console.log(`\n=== Summary ===`);
  console.log(`  Features:         ${total}`);
  console.log(`  Places indexed:   ${s.unique_places}`);
  console.log(`  Cell assignments: ${s.total_rows}`);
  console.log(`  Unique cells:     ${s.unique_cells}`);
  console.log(`  Grid range:       x[${s.min_x}–${s.max_x}] y[${s.min_y}–${s.max_y}]`);
  console.log(`  RD origin:        (${min_x.toFixed(0)}, ${min_y.toFixed(0)}) → (${gridMaxX.toFixed(0)}, ${gridMaxY.toFixed(0)})`);
  console.log(`  Grid bounds (WGS84): lon[${bounds.min_lon}–${bounds.max_lon}] lat[${bounds.min_lat}–${bounds.max_lat}]`);
  console.log(`  Max frequencies:  spatial=${freq.max_spatial} temporal=${freq.max_temporal}`);
  console.log(`  Temporal coverage: ${parseInt(total) - parseInt(missing_temporal)}/${total} features`);
}
