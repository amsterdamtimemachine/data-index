import { sql } from 'drizzle-orm';
import type {
  RecordType,
  PlaceType,
  PlaceSource,
  FeaturesQuery,
  FeatureResult,
  FeaturesResponse,
  Entity,
} from '@atm/shared';
import { computeTimeSlices } from './time-slices';
import { getRecordTypes } from './record-types';
import { getGridConfig } from './grid-config';
import { featureYearOverlap } from './time-filter';
import { db } from '../client';
import { featureToPlace, place, placeGeometry, placeCells } from '../schema';
import type { CountRow } from '../row-types';

// Query result types
type FeatureRow = {
  id: string;
  url: string | null;
  record_type: RecordType;
  place_type: PlaceType;
  label: string;
  description: string | null;
  content_url: string | null;
  start_date: string | null;
  end_date: string | null;
  spatial_frequency: number | null;
  temporal_frequency: number | null;
  dataset_label: string | null;
  dataset_url: string | null;
  organisation_label: string | null;
  organisation_url: string | null;
  relevance_score: number | null;
  entity: Entity | null;
  relation_id: string | null;
  name: string | null;
  historical_label: string | null;
  place_source: PlaceSource | null;
  place_url: string | null;
  place_provider_label: string | null;
  place_provider_url: string | null;
  geometry_provider_label: string | null;
  geometry_url: string | null;
  tags: string[] | null;
};

/**
 * Convert a display-cell's geographic bounds to the exact set of base cells
 * the heatmap folded into that display cell.
 *
 * The frontend builds the bounds it sends here from calculateCellBounds(), which
 * uniformly divides the grid_config bounds into colsAmount × rowsAmount display
 * cells (colsAmount === the heatmap's gridCols). So the display resolution and
 * this cell's (col, row) are recoverable from the bounds; round() absorbs the
 * float4 precision of the grid_config bounds.
 *
 * getHeatmap assigns base cell -> display cell with the forward partition
 *   display = floor(cell * gridN / (maxN + 1)).
 * This is its exact inverse:
 *   cell ∈ [ceil(col * (maxN+1) / gridN), ceil((col+1) * (maxN+1) / gridN) - 1]
 * so getFeatures counts exactly the base cells getHeatmap counted — the hover
 * count and the per-cell feature total always agree.
 *
 * Bounds are first clamped to the grid's WGS84 extent (the grid-aligned bounds
 * in grid_config). Every real display cell already lies inside the grid, so for
 * them the clamp is a no-op; a viewport wider than the grid simply collapses to
 * the full base-cell range.
 */
async function boundsToBaseCellRange(bounds: FeaturesQuery['bounds']): Promise<{
  minCellX: number;
  maxCellX: number;
  minCellY: number;
  maxCellY: number;
}> {
  const config = await getGridConfig();

  const minLon = Math.max(bounds.minLon, config.minLon);
  const maxLon = Math.min(bounds.maxLon, config.maxLon);
  const minLat = Math.max(bounds.minLat, config.minLat);
  const maxLat = Math.min(bounds.maxLat, config.maxLat);

  // Width/height of one display cell in WGS84.
  const cellW = maxLon - minLon;
  const cellH = maxLat - minLat;

  // Bounds entirely outside the data extent → empty range.
  if (cellW <= 0 || cellH <= 0) {
    return { minCellX: 0, maxCellX: -1, minCellY: 0, maxCellY: -1 };
  }

  // Recover the display grid resolution and this cell's column/row.
  const gridCols = Math.max(1, Math.round((config.maxLon - config.minLon) / cellW));
  const gridRows = Math.max(1, Math.round((config.maxLat - config.minLat) / cellH));
  const col = Math.round((minLon - config.minLon) / cellW);
  const row = Math.round((minLat - config.minLat) / cellH);

  // Base cells are 0-indexed (cell_x = floor((x - min_x) / cellSize)), so the
  // index span is [0, maxN]; the partition divisor is maxN + 1 — matching getHeatmap.
  const spanX = config.maxCellX + 1;
  const spanY = config.maxCellY + 1;

  const minCellX = Math.ceil((col * spanX) / gridCols);
  const maxCellX = Math.ceil(((col + 1) * spanX) / gridCols) - 1;
  const minCellY = Math.ceil((row * spanY) / gridRows);
  const maxCellY = Math.ceil(((row + 1) * spanY) / gridRows) - 1;

  return {
    minCellX: Math.max(minCellX, 0),
    maxCellX: Math.min(maxCellX, config.maxCellX),
    minCellY: Math.max(minCellY, 0),
    maxCellY: Math.min(maxCellY, config.maxCellY)
  };
}

/**
 * Get date range from time slice key
 */
async function getTimeSliceDateRange(timeSliceKey: string): Promise<{ startYear: number; endYear: number } | null> {
  const timeSlices = await computeTimeSlices();
  const timeSlice = timeSlices.find(ts => ts.key === timeSliceKey);
  if (!timeSlice) return null;
  return {
    startYear: timeSlice.startYear,
    endYear: timeSlice.endYear
  };
}

/**
 * Get features within bounds with filtering, sorting, and pagination
 */
export async function getFeatures(query: FeaturesQuery): Promise<FeaturesResponse> {
  const {
    bounds,
    recordTypes,
    datasetIds,
    placeTypes,
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

  // Default to every record type in the data — same fallback as the heatmap and
  // histogram, so an unfiltered feature list always matches an unfiltered heatmap.
  const types = recordTypes && recordTypes.length > 0
    ? recordTypes
    : await getRecordTypes();

  if (types.length === 0) {
    return { data: [], total: 0, page, pageSize, totalPages: 0 };
  }

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
  const cellCondition = sql`pc.cell_x BETWEEN ${cellRange.minCellX} AND ${cellRange.maxCellX}
    AND pc.cell_y BETWEEN ${cellRange.minCellY} AND ${cellRange.maxCellY}`;

  const typeCondition = sql`f.record_type IN ${types}`;

  const datasetCondition = datasetIds && datasetIds.length > 0
    ? sql`f.dataset_id IN ${datasetIds}`
    : sql`TRUE`;

  const placeTypeCondition = placeTypes && placeTypes.length > 0
    ? sql`p.type IN ${placeTypes}`
    : sql`TRUE`;

  const dateCondition = dateRange
    ? featureYearOverlap(sql`f.start_date`, sql`f.end_date`, dateRange.startYear, dateRange.endYear)
    : sql`TRUE`;

  const tagCondition = tagFilteredIds
    ? sql`f.id IN ${tagFilteredIds}`
    : sql`TRUE`;

  // Get total count
  const countResult = await db.execute<CountRow>(sql`
    SELECT COUNT(DISTINCT f.id) as count
    FROM ${placeCells} pc
    JOIN ${featureToPlace} fp ON pc.place_id = fp.place_id
    JOIN features f ON fp.feature_id = f.id
    JOIN ${place} p ON pc.place_id = p.id
    WHERE ${cellCondition}
      AND ${typeCondition}
      AND ${datasetCondition}
      AND ${dateCondition}
      AND ${tagCondition}
      AND ${placeTypeCondition}
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
  const { maxSpatialFrequency: maxSpatial, maxTemporalFrequency: maxTemporal } = await getGridConfig();

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
        p.type as place_type,
        f.label,
        f.description,
        f.content_url,
        f.start_date,
        f.end_date,
        pg.spatial_frequency,
        f.temporal_frequency,
        (COALESCE(pg.spatial_frequency::float, 0) / ${maxSpatial}
         + COALESCE(f.temporal_frequency::float, 0) / ${maxTemporal}) as relevance_score,
        d.label as dataset_label,
        d.url as dataset_url,
        o.label as organisation_label,
        o.url as organisation_url,
        f.entity,
        fp.relation_id,
        p.name,
        p.source as place_source,
        p.url as place_url,
        po.label as place_provider_label,
        po.url as place_provider_url,
        go.label as geometry_provider_label,
        pg.url as geometry_url,
        (SELECT a.name FROM place_historical_name a
         WHERE a.place_id = fp.place_id
           AND a.since <= f.end_date
         ORDER BY a.since DESC LIMIT 1) as historical_label
      FROM ${placeCells} pc
      JOIN ${featureToPlace} fp ON pc.place_id = fp.place_id
      JOIN features f ON fp.feature_id = f.id
      JOIN ${place} p ON pc.place_id = p.id
      JOIN ${placeGeometry} pg ON pc.place_id = pg.place_id
      LEFT JOIN datasets d ON f.dataset_id = d.id
      LEFT JOIN organisations o ON d.organisation_id = o.id
      LEFT JOIN organisations po ON p.source = po.id
      LEFT JOIN organisations go ON pg.source = go.id
      WHERE ${cellCondition}
        AND ${typeCondition}
        AND ${datasetCondition}
        AND ${dateCondition}
        AND ${tagCondition}
        AND ${placeTypeCondition}
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
      place_type,
      label,
      description,
      content_url,
      start_date,
      end_date,
      spatial_frequency,
      temporal_frequency,
      relevance_score,
      dataset_label,
      dataset_url,
      organisation_label,
      organisation_url,
      entity,
      relation_id,
      name,
      historical_label,
      place_source,
      place_url,
      place_provider_label,
      place_provider_url,
      geometry_provider_label,
      geometry_url,
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
    placeType: row.place_type,
    label: row.label,
    description: row.description?.slice(0, 128) || undefined,
    contentUrl: row.content_url || undefined,
    dateRange: [
      row.start_date ? new Date(row.start_date).getFullYear() : 0,
      row.end_date ? new Date(row.end_date).getFullYear() : 0
    ] as [number, number],
    tags: row.tags || [],
    datasetLabel: row.dataset_label || undefined,
    datasetUrl: row.dataset_url || undefined,
    organisationLabel: row.organisation_label || undefined,
    organisationUrl: row.organisation_url || undefined,
    spatialFrequency: row.spatial_frequency || 1,
    temporalFrequency: row.temporal_frequency || 1,
    entity: row.entity || undefined,
    relationId: row.relation_id || undefined,
    displayName: row.name || undefined,
    placeSource: row.place_source || undefined,
    placeUrl: row.place_url || undefined,
    placeProviderLabel: row.place_provider_label || undefined,
    placeProviderUrl: row.place_provider_url || undefined,
    geometryProviderLabel: row.geometry_provider_label || undefined,
    geometryUrl: row.geometry_url || undefined,
    historicalLabel: row.historical_label || undefined
  }));

  return {
    data,
    total,
    page,
    pageSize,
    totalPages
  };
}
