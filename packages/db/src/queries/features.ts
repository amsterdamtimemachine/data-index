import { sql } from 'drizzle-orm';
import { createTTLCache } from './cache';
import type {
  RecordType,
  FeaturesQuery,
  FeatureResult,
  FeaturesResponse,
} from '@atm/shared';
import { computeTimeSlices } from './time-slices';
import { db } from '../client';
import { featureToPlace, place } from '../schema';

// Query result types (internal)
type BaseCellBoundsRow = {
  min_x: number;
  max_x: number;
  min_y: number;
  max_y: number;
  min_lon: number;
  max_lon: number;
  min_lat: number;
  max_lat: number;
};

type FeatureRow = {
  id: string;
  url: string | null;
  record_type: RecordType;
  label: string;
  description: string | null;
  content_url: string | null;
  start_date: string | null;
  end_date: string | null;
  spatial_frequency: number | null;
  temporal_frequency: number | null;
  source_label: string | null;
  relevance_score: number | null;
  entity: any | null;
  relation_id: string | null;
  tags: string[] | null;
};

type CountRow = { count: string };
type MaxFreqRow = { max_spatial: string; max_temporal: string };

const baseCellBoundsCache = createTTLCache<BaseCellBoundsRow>();
const maxFrequenciesCache = createTTLCache<{ maxSpatial: number; maxTemporal: number }>();

/**
 * Get max spatial and temporal frequencies for normalisation
 */
async function getMaxFrequencies(): Promise<{ maxSpatial: number; maxTemporal: number }> {
  const cached = maxFrequenciesCache.get();
  if (cached) return cached;

  const result = await db.execute<MaxFreqRow>(sql`
    SELECT
      COALESCE(MAX(spatial_frequency), 1) as max_spatial,
      COALESCE(MAX(temporal_frequency), 1) as max_temporal
    FROM features
  `);
  const value = {
    maxSpatial: parseInt(result.rows[0].max_spatial) || 1,
    maxTemporal: parseInt(result.rows[0].max_temporal) || 1
  };
  maxFrequenciesCache.set(value);
  return value;
}

/**
 * Get the base grid cell bounds and geographic extent
 */
async function getBaseCellBounds(): Promise<BaseCellBoundsRow> {
  const cached = baseCellBoundsCache.get();
  if (cached) return cached;

  const result = await db.execute<BaseCellBoundsRow>(sql`
    SELECT
      MIN(fc.cell_x) as min_x,
      MAX(fc.cell_x) as max_x,
      MIN(fc.cell_y) as min_y,
      MAX(fc.cell_y) as max_y,
      ST_XMin(ST_Extent(ST_Transform(p.geometry, 4326))) as min_lon,
      ST_XMax(ST_Extent(ST_Transform(p.geometry, 4326))) as max_lon,
      ST_YMin(ST_Extent(ST_Transform(p.geometry, 4326))) as min_lat,
      ST_YMax(ST_Extent(ST_Transform(p.geometry, 4326))) as max_lat
    FROM feature_cells fc
    JOIN ${featureToPlace} fp ON fc.feature_id = fp.feature_id
    JOIN ${place} p ON fp.place_id = p.id
    WHERE p.geometry IS NOT NULL
  `);

  baseCellBoundsCache.set(result.rows[0]);
  return result.rows[0];
}

/**
 * Convert geographic bounds to base cell range
 */
async function boundsToBaseCellRange(bounds: FeaturesQuery['bounds']): Promise<{
  minCellX: number;
  maxCellX: number;
  minCellY: number;
  maxCellY: number;
}> {
  const base = await getBaseCellBounds();

  const cellWidth = (base.max_lon - base.min_lon) / (base.max_x - base.min_x + 1);
  const cellHeight = (base.max_lat - base.min_lat) / (base.max_y - base.min_y + 1);

  // Epsilon prevents floating point errors from missing boundary cells
  const EPSILON = 1e-9;

  const minCellX = Math.floor((bounds.minLon - base.min_lon) / cellWidth) + base.min_x;
  const maxCellX = Math.floor((bounds.maxLon - base.min_lon + EPSILON) / cellWidth) + base.min_x;
  const minCellY = Math.floor((bounds.minLat - base.min_lat) / cellHeight) + base.min_y;
  const maxCellY = Math.floor((bounds.maxLat - base.min_lat + EPSILON) / cellHeight) + base.min_y;

  return {
    minCellX: Math.max(minCellX, base.min_x),
    maxCellX: Math.min(maxCellX, base.max_x),
    minCellY: Math.max(minCellY, base.min_y),
    maxCellY: Math.min(maxCellY, base.max_y)
  };
}

/**
 * Get date range from time slice key
 */
async function getTimeSliceDateRange(timeSliceKey: string): Promise<{ startDate: string; endDate: string } | null> {
  const timeSlices = await computeTimeSlices();
  const timeSlice = timeSlices.find(ts => ts.key === timeSliceKey);
  if (!timeSlice) return null;
  return {
    startDate: timeSlice.timeRange.start,
    endDate: timeSlice.timeRange.end
  };
}

/**
 * Get features within bounds with filtering, sorting, and pagination
 */
export async function getFeatures(query: FeaturesQuery): Promise<FeaturesResponse> {
  const {
    bounds,
    recordTypes,
    tags: tagFilters,
    tagOperator = 'OR',
    timeSlice,
    sort = 'relevance',
    sortDirection = 'desc',
    page = 1,
    pageSize = 50
  } = query;

  // Convert bounds to base cell range
  const cellRange = await boundsToBaseCellRange(bounds);

  // Get date range from time slice
  const dateRange = timeSlice ? await getTimeSliceDateRange(timeSlice) : null;

  // Default to all record types if none specified
  const types = recordTypes && recordTypes.length > 0
    ? recordTypes
    : ['image', 'text', 'person'] as RecordType[];

  // Calculate offset
  const offset = (page - 1) * pageSize;

  // Get feature IDs matching tag filter (if any)
  let tagFilteredIds: string[] | null = null;
  if (tagFilters && tagFilters.length > 0) {
    if (tagOperator === 'AND') {
      const tagResult = await db.execute<{ feature_id: string }>(sql`
        SELECT ft.feature_id
        FROM feature_tags ft
        JOIN tags t ON ft.tag_id = t.id
        WHERE t.label IN ${tagFilters}
        GROUP BY ft.feature_id
        HAVING COUNT(DISTINCT t.id) = ${tagFilters.length}
      `);
      tagFilteredIds = tagResult.rows.map(r => r.feature_id);
    } else {
      const tagResult = await db.execute<{ feature_id: string }>(sql`
        SELECT DISTINCT ft.feature_id
        FROM feature_tags ft
        JOIN tags t ON ft.tag_id = t.id
        WHERE t.label IN ${tagFilters}
      `);
      tagFilteredIds = tagResult.rows.map(r => r.feature_id);
    }

    // Early return if no features match tag filter
    if (tagFilteredIds.length === 0) {
      return { data: [], total: 0, page, pageSize, totalPages: 0 };
    }
  }

  // Build WHERE conditions
  const cellCondition = sql`fc.cell_x BETWEEN ${cellRange.minCellX} AND ${cellRange.maxCellX}
    AND fc.cell_y BETWEEN ${cellRange.minCellY} AND ${cellRange.maxCellY}`;

  const typeCondition = sql`f.record_type IN ${types}`;

  const dateCondition = dateRange
    ? sql`f.start_date <= ${dateRange.endDate} AND f.end_date >= ${dateRange.startDate}`
    : sql`TRUE`;

  const tagCondition = tagFilteredIds
    ? sql`f.id IN ${tagFilteredIds}`
    : sql`TRUE`;

  // Get total count
  const countResult = await db.execute<CountRow>(sql`
    SELECT COUNT(DISTINCT f.id) as count
    FROM feature_cells fc
    JOIN features f ON fc.feature_id = f.id
    WHERE ${cellCondition}
      AND ${typeCondition}
      AND ${dateCondition}
      AND ${tagCondition}
  `);

  const total = parseInt(countResult.rows[0].count);
  const totalPages = Math.ceil(total / pageSize);

  if (total === 0) {
    return { data: [], total: 0, page, pageSize, totalPages: 0 };
  }

  // Build ORDER BY for window function
  const sortDir = sortDirection === 'asc' ? sql`ASC` : sql`DESC`;
  const secondarySortDir = sortDirection === 'asc' ? sql`DESC` : sql`ASC`;

  // Main query with window function for interleaved record types
  // Note: Using raw SQL string for window function ORDER BY since Drizzle doesn't support it well
  // Get max frequencies for relevance score normalisation
  const { maxSpatial, maxTemporal } = await getMaxFrequencies();

  // Lower score = more specific = higher relevance
  const orderByRelevance = sortDirection === 'desc'
    ? 'relevance_score ASC NULLS LAST, start_date ASC NULLS LAST'
    : 'relevance_score DESC NULLS LAST, start_date DESC NULLS LAST';

  const orderBySpatialFrequency = sortDirection === 'desc'
    ? 'spatial_frequency ASC NULLS LAST, start_date ASC NULLS LAST'
    : 'spatial_frequency DESC NULLS LAST, start_date DESC NULLS LAST';

  const orderByDate = sortDirection === 'desc'
    ? 'start_date DESC NULLS LAST, relevance_score ASC NULLS LAST'
    : 'start_date ASC NULLS LAST, relevance_score DESC NULLS LAST';

  const windowOrderBy = sort === 'relevance' ? orderByRelevance
    : sort === 'spatialFrequency' ? orderBySpatialFrequency
    : orderByDate;

  const result = await db.execute<FeatureRow>(sql`
    WITH filtered AS (
      SELECT DISTINCT ON (f.id)
        f.id,
        f.url,
        f.record_type,
        f.label,
        f.description,
        f.content_url,
        f.start_date,
        f.end_date,
        f.spatial_frequency,
        f.temporal_frequency,
        (COALESCE(f.spatial_frequency::float, 0) / ${maxSpatial}
         + COALESCE(f.temporal_frequency::float, 0) / ${maxTemporal}) as relevance_score,
        s.label as source_label,
        f.entity,
        fp.relation_id
      FROM feature_cells fc
      JOIN features f ON fc.feature_id = f.id
      LEFT JOIN sources s ON f.source_id = s.id
      LEFT JOIN feature_to_place fp ON f.id = fp.feature_id
      WHERE ${cellCondition}
        AND ${typeCondition}
        AND ${dateCondition}
        AND ${tagCondition}
    ),
    with_tags AS (
      SELECT
        f.*,
        COALESCE(
          ARRAY(
            SELECT t.label
            FROM feature_tags ft
            JOIN tags t ON ft.tag_id = t.id
            WHERE ft.feature_id = f.id
          ),
          ARRAY[]::text[]
        ) as tags
      FROM filtered f
    ),
    ranked AS (
      SELECT *,
        ROW_NUMBER() OVER (
          PARTITION BY record_type
          ORDER BY ${sql.raw(windowOrderBy)}, id ASC
        ) as type_rank
      FROM with_tags
    )
    SELECT
      id,
      url,
      record_type,
      label,
      description,
      content_url,
      start_date,
      end_date,
      spatial_frequency,
      temporal_frequency,
      relevance_score,
      source_label,
      entity,
      relation_id,
      tags
    FROM ranked
    ORDER BY type_rank, record_type, id
    LIMIT ${pageSize}
    OFFSET ${offset}
  `);

  // Transform results
  const data: FeatureResult[] = result.rows.map(row => ({
    id: row.id,
    url: row.url || undefined,
    recordType: row.record_type,
    label: row.label,
    description: row.description || undefined,
    contentUrl: row.content_url || undefined,
    dateRange: [
      row.start_date ? new Date(row.start_date).getFullYear() : 0,
      row.end_date ? new Date(row.end_date).getFullYear() : 0
    ] as [number, number],
    tags: row.tags || [],
    sourceLabel: row.source_label || undefined,
    spatialFrequency: row.spatial_frequency || 1,
    temporalFrequency: row.temporal_frequency || 1,
    entity: row.entity || undefined,
    relationId: row.relation_id || undefined
  }));

  return {
    data,
    total,
    page,
    pageSize,
    totalPages
  };
}
