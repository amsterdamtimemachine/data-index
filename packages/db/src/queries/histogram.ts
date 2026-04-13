import { sql } from 'drizzle-orm';
import type { Histogram, HistogramBin, RecordType } from '@atm/shared';
import { DEFAULT_BIN_SIZE } from '@atm/shared';
import { db } from '../client';
import { features } from '../schema';
import { computeTimeSlices, computeTimeRange } from './time-slices';

// Query result types
type BinRow = { bin_start: string; count: string };
type RecordTypeRow = { record_type: RecordType };

/**
 * Get all available record types from the database
 */
async function getRecordTypes(): Promise<RecordType[]> {
  const result = await db.execute<RecordTypeRow>(
    sql`SELECT DISTINCT ${features.recordType} as record_type FROM ${features} WHERE ${features.recordType} IS NOT NULL`
  );
  return result.rows.map(r => r.record_type);
}

/**
 * Get histogram data for combined record types
 */
export async function getHistogram(
  recordTypes?: RecordType[],
  datasetIds?: string[],
  binSizeYears: number = DEFAULT_BIN_SIZE
): Promise<Histogram> {
  const types = recordTypes || await getRecordTypes();

  const [timeSlices, timeRange] = await Promise.all([
    computeTimeSlices(binSizeYears),
    computeTimeRange(binSizeYears)
  ]);

  const firstSlice = timeSlices[0];
  const lastSlice = timeSlices[timeSlices.length - 1];

  const result = await db.execute<BinRow>(sql`
    WITH slices AS (
      SELECT gs AS bin_start, gs + ${binSizeYears}::int AS bin_end
      FROM generate_series(${firstSlice.startYear}::int, ${lastSlice.startYear}::int, ${binSizeYears}::int) AS gs
    )
    SELECT s.bin_start::text as bin_start, COUNT(DISTINCT f.id) as count
    FROM ${features} f
    JOIN slices s ON EXTRACT(YEAR FROM f.start_date) < s.bin_end
                 AND EXTRACT(YEAR FROM f.end_date) >= s.bin_start
    WHERE f.record_type IN ${types}
      ${datasetIds && datasetIds.length > 0 ? sql`AND f.dataset_id IN ${datasetIds}` : sql``}
      AND f.start_date IS NOT NULL
      AND f.end_date IS NOT NULL
    GROUP BY s.bin_start
    ORDER BY s.bin_start
  `);

  // Build bin map from results
  const binMap = new Map<number, number>(
    result.rows.map(r => [parseInt(r.bin_start), parseInt(r.count)])
  );

  // Map onto computed time slices
  const bins: HistogramBin[] = timeSlices.map(ts => ({
    timeSlice: ts,
    count: binMap.get(ts.startYear) || 0
  }));

  const totalFeatures = bins.reduce((sum, b) => sum + b.count, 0);
  const maxCount = Math.max(...bins.map(b => b.count), 0);

  return {
    bins,
    maxCount,
    timeRange,
    totalFeatures
  };
}
