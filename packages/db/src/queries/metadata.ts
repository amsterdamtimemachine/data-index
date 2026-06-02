import { sql } from 'drizzle-orm';
import type {
  VisualizationMetadata,
  RecordType,
  PlaceType,
} from '@atm/shared';
import { computeTimeSlices, computeTimeRange } from './time-slices';
import { getRecordTypes } from './record-types';
import { db } from '../client';
import { features, datasets, tags, featureTags, placeCells, featureToPlace, place } from '../schema';

// Query result types
type PlaceTypeRow = { place_type: PlaceType };
type TagRow = { id: string };
type CountRow = { count: string };
type RecordTypeCountRow = { record_type: RecordType; count: string };
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
 * Get distinct place types that have features linked to them
 */
async function getPlaceTypes(): Promise<PlaceType[]> {
  const result = await db.execute<PlaceTypeRow>(sql`
    SELECT DISTINCT ${place.type} as place_type
    FROM ${place}
    JOIN ${featureToPlace} ON ${place.id} = ${featureToPlace.placeId}
    ORDER BY ${place.type}
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
    db.execute<CountRow>(sql`SELECT COUNT(DISTINCT (${placeCells.cellX}, ${placeCells.cellY})) as count FROM ${placeCells}`)
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
 * Get complete visualization metadata
 */
export async function getMetadata(): Promise<VisualizationMetadata> {
  const [timeSlices, timeRange, recordTypes, placeTypes, availableDatasets, availableTags, stats] = await Promise.all([
    computeTimeSlices(),
    computeTimeRange(),
    getRecordTypes(),
    getPlaceTypes(),
    getDatasets(),
    getTags(),
    getStats()
  ]);

  return {
    timeSlices,
    timeRange,
    recordTypes,
    placeTypes,
    datasets: availableDatasets,
    tags: availableTags,
    stats: {
      totalFeatures: stats.totalFeatures,
      featuresPerRecordType: stats.featuresPerRecordType,
      timeSliceCount: timeSlices.length,
      gridCellCount: stats.gridCellCount,
    }
  };
}
