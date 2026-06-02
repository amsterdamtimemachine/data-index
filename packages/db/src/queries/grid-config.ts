import { sql } from 'drizzle-orm';
import { db } from '../client';
import { gridConfig } from '../schema';

/**
 * Pre-computed grid metadata written by rebuild-index (single 'current' row):
 * the base-cell index extent, the WGS84 bounds of the data, and the max spatial
 * / temporal frequencies used to normalise relevance scores.
 */
export interface GridConfig {
  minCellX: number;
  maxCellX: number;
  minCellY: number;
  maxCellY: number;
  minLon: number;
  maxLon: number;
  minLat: number;
  maxLat: number;
  maxSpatialFrequency: number;
  maxTemporalFrequency: number;
}

type GridConfigRow = {
  min_cell_x: number; max_cell_x: number;
  min_cell_y: number; max_cell_y: number;
  min_lon: number; max_lon: number;
  min_lat: number; max_lat: number;
  max_spatial_frequency: number;
  max_temporal_frequency: number;
};

/**
 * Read the pre-computed grid config. Single indexed-row read — not cached, so it
 * always reflects the latest rebuild-index without a staleness window.
 *
 * Single source of truth for heatmap and features (they previously each had a
 * private copy with a *different* missing-row policy — one returned zeros, the
 * other threw). Throwing is the correct, consistent policy: a missing row means
 * rebuild-index hasn't run. Callers that must tolerate an empty database guard on
 * empty time slices / record types before they reach here.
 */
export async function getGridConfig(): Promise<GridConfig> {
  const result = await db.execute<GridConfigRow>(
    sql`SELECT * FROM ${gridConfig} WHERE id = 'current'`
  );

  const row = result.rows[0];
  if (!row) {
    throw new Error('Grid config not found. Run rebuild-index first.');
  }

  return {
    minCellX: row.min_cell_x,
    maxCellX: row.max_cell_x,
    minCellY: row.min_cell_y,
    maxCellY: row.max_cell_y,
    minLon: row.min_lon,
    maxLon: row.max_lon,
    minLat: row.min_lat,
    maxLat: row.max_lat,
    maxSpatialFrequency: row.max_spatial_frequency || 1,
    maxTemporalFrequency: row.max_temporal_frequency || 1,
  };
}
