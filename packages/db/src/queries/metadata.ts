import { sql } from 'drizzle-orm';
import type {
  VisualizationMetadata,
  RecordType,
  HeatmapDimensions,
  HeatmapResolutionConfig
} from '@atm/shared';
import { TIME_SLICES, TIME_RANGE, GRID_ROWS, GRID_COLS } from '@atm/shared';
import { db } from '../client';
import { place, features, tags, featureTags, featureCells } from '../schema';

const VERSION = '2.0.0';

// Query result types
type BoundsRow = { min_lon: string; max_lon: string; min_lat: string; max_lat: string };
type RecordTypeRow = { record_type: RecordType };
type TagRow = { id: string };
type CountRow = { count: string };
type RecordTypeCountRow = { record_type: RecordType; count: string };

interface Bounds {
  minLon: number;
  maxLon: number;
  minLat: number;
  maxLat: number;
}

/**
 * Get geographic bounds from actual data extent
 * Transforms from RD (28992) to WGS84 (4326) for frontend
 */
async function getBoundsFromData(): Promise<Bounds> {
  const result = await db.execute<BoundsRow>(sql`
    SELECT
      ST_XMin(ST_Extent(ST_Transform(${place.geometry}, 4326))) as min_lon,
      ST_XMax(ST_Extent(ST_Transform(${place.geometry}, 4326))) as max_lon,
      ST_YMin(ST_Extent(ST_Transform(${place.geometry}, 4326))) as min_lat,
      ST_YMax(ST_Extent(ST_Transform(${place.geometry}, 4326))) as max_lat
    FROM ${place}
    WHERE ${place.geometry} IS NOT NULL
  `);

  const row = result.rows[0];
  return {
    minLon: parseFloat(row.min_lon),
    maxLon: parseFloat(row.max_lon),
    minLat: parseFloat(row.min_lat),
    maxLat: parseFloat(row.max_lat)
  };
}

/**
 * Get all distinct record types from features table
 */
async function getRecordTypes(): Promise<RecordType[]> {
  const result = await db.execute<RecordTypeRow>(sql`
    SELECT DISTINCT ${features.recordType} as record_type
    FROM ${features}
    WHERE ${features.recordType} IS NOT NULL
    ORDER BY ${features.recordType}
  `);
  return result.rows.map(r => r.record_type);
}

/**
 * Get all tags that are actually used (linked to features)
 */
async function getTags(): Promise<string[]> {
  const result = await db.execute<TagRow>(sql`
    SELECT DISTINCT ${tags.id} as id
    FROM ${tags}
    JOIN ${featureTags} ON ${tags.id} = ${featureTags.tagId}
    ORDER BY ${tags.id}
  `);
  return result.rows.map(r => r.id);
}

/**
 * Get statistics about the data
 */
async function getStats(): Promise<{
  totalFeatures: number;
  featuresPerRecordType: Record<RecordType, number>;
  gridCellCount: number;
}> {
  const [totalResult, perTypeResult, cellCountResult] = await Promise.all([
    db.execute<CountRow>(sql`SELECT COUNT(*) as count FROM ${features}`),
    db.execute<RecordTypeCountRow>(sql`
      SELECT ${features.recordType} as record_type, COUNT(*) as count
      FROM ${features}
      WHERE ${features.recordType} IS NOT NULL
      GROUP BY ${features.recordType}
    `),
    db.execute<CountRow>(sql`SELECT COUNT(DISTINCT (${featureCells.cellX}, ${featureCells.cellY})) as count FROM ${featureCells}`)
  ]);

  const featuresPerRecordType: Record<string, number> = {};
  for (const row of perTypeResult.rows) {
    featuresPerRecordType[row.record_type] = parseInt(row.count);
  }

  return {
    totalFeatures: parseInt(totalResult.rows[0].count),
    featuresPerRecordType: featuresPerRecordType as Record<RecordType, number>,
    gridCellCount: parseInt(cellCountResult.rows[0].count)
  };
}

/**
 * Build heatmap dimensions from bounds and grid config
 */
function buildHeatmapDimensions(bounds: Bounds): HeatmapDimensions {
  return {
    colsAmount: GRID_COLS,
    rowsAmount: GRID_ROWS,
    minLon: bounds.minLon,
    maxLon: bounds.maxLon,
    minLat: bounds.minLat,
    maxLat: bounds.maxLat
  };
}

/**
 * Get complete visualization metadata
 * Combines config constants with data queried from database
 */
export async function getMetadata(): Promise<VisualizationMetadata> {
  const [bounds, recordTypes, availableTags, stats] = await Promise.all([
    getBoundsFromData(),
    getRecordTypes(),
    getTags(),
    getStats()
  ]);

  const heatmapDimensions = buildHeatmapDimensions(bounds);

  const resolutions: HeatmapResolutionConfig[] = [
    { cols: GRID_COLS, rows: GRID_ROWS }
  ];

  const resolutionKey = `${GRID_COLS}x${GRID_ROWS}`;

  return {
    version: VERSION,
    timestamp: new Date().toISOString(),
    heatmapDimensions,
    timeSlices: TIME_SLICES,
    timeRange: TIME_RANGE,
    recordTypes,
    tags: availableTags,
    resolutions,
    resolutionDimensions: {
      [resolutionKey]: heatmapDimensions
    },
    stats: {
      totalFeatures: stats.totalFeatures,
      featuresPerRecordType: stats.featuresPerRecordType,
      timeSliceCount: TIME_SLICES.length,
      gridCellCount: stats.gridCellCount,
      resolutionCount: resolutions.length
    }
  };
}
