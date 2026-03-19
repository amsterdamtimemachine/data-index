import { sql } from 'drizzle-orm';
import type {
  VisualizationMetadata,
  RecordType,
} from '@atm/shared';
import { computeTimeSlices, computeTimeRange } from './time-slices';
import { db } from '../client';
import { features, tags, featureTags, featureCells } from '../schema';

// Query result types
type RecordTypeRow = { record_type: RecordType };
type TagRow = { id: string };
type CountRow = { count: string };
type RecordTypeCountRow = { record_type: RecordType; count: string };

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
 * Get complete visualization metadata
 */
export async function getMetadata(): Promise<VisualizationMetadata> {
  const [timeSlices, timeRange, recordTypes, availableTags, stats] = await Promise.all([
    computeTimeSlices(),
    computeTimeRange(),
    getRecordTypes(),
    getTags(),
    getStats()
  ]);

  return {
    timeSlices,
    timeRange,
    recordTypes,
    tags: availableTags,
    stats: {
      totalFeatures: stats.totalFeatures,
      featuresPerRecordType: stats.featuresPerRecordType,
      timeSliceCount: timeSlices.length,
      gridCellCount: stats.gridCellCount,
    }
  };
}
