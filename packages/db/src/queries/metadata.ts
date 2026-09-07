import { sql } from 'drizzle-orm';
import type { VisualizationMetadata, PlaceType } from '@atm/shared';
import { computeTimeSlices } from './time-slices';
import { getRecordTypes } from './record-types';
import { createTTLCache } from './cache';
import { db } from '../client';
import { datasets, tags, featureTags, cellFeatures } from '../schema';

// Query result types
type PlaceTypeRow = { place_type: PlaceType };
type TagRow = { id: string };
type SourceRow = { id: string; label: string };

/**
 * Get all available datasets
 */
async function getDatasets(): Promise<{ id: string; label: string }[]> {
  const result = await db.execute<SourceRow>(sql`
    SELECT ${datasets.id} as id, ${datasets.label} as label
    FROM ${datasets}
    ORDER BY ${datasets.label}
  `);
  return result.rows;
}

/**
 * Place types that have features on the map. Read from cell_features — the
 * population the heatmap counts — instead of joining every feature→place link.
 */
async function getPlaceTypes(): Promise<PlaceType[]> {
  const result = await db.execute<PlaceTypeRow>(sql`
    SELECT DISTINCT ${cellFeatures.placeType} as place_type
    FROM ${cellFeatures}
    ORDER BY ${cellFeatures.placeType}
  `);
  return result.rows.map(r => r.place_type);
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

const cache = createTTLCache<VisualizationMetadata>();

/**
 * Complete visualization metadata. Cached: every page load awaits this during
 * SSR, and it only changes after a rebuild.
 */
export async function getMetadata(): Promise<VisualizationMetadata> {
  const cached = cache.get();
  if (cached) return cached;

  const [timeSlices, recordTypes, placeTypes, availableDatasets, availableTags] = await Promise.all([
    computeTimeSlices(),
    getRecordTypes(),
    getPlaceTypes(),
    getDatasets(),
    getTags()
  ]);

  const metadata: VisualizationMetadata = {
    timeSlices,
    recordTypes,
    placeTypes,
    datasets: availableDatasets,
    tags: availableTags
  };
  cache.set(metadata);
  return metadata;
}
