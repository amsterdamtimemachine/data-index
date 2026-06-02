import { eq } from 'drizzle-orm';
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
  const [row] = await db
    .select()
    .from(gridConfig)
    .where(eq(gridConfig.id, 'current'))
    .limit(1);

  if (!row) {
    throw new Error('Grid config not found. Run rebuild-index first.');
  }

  return {
    minCellX: row.minCellX,
    maxCellX: row.maxCellX,
    minCellY: row.minCellY,
    maxCellY: row.maxCellY,
    minLon: row.minLon,
    maxLon: row.maxLon,
    minLat: row.minLat,
    maxLat: row.maxLat,
    maxSpatialFrequency: row.maxSpatialFrequency || 1,
    maxTemporalFrequency: row.maxTemporalFrequency || 1,
  };
}
