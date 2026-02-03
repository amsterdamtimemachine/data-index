import { sql } from 'drizzle-orm';
import type { Histogram, HistogramBin, RecordType } from '@atm/shared';
import { TIME_SLICES, TIME_RANGE } from '@atm/shared';
import { db } from '../client';
import { features } from '../schema';

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
 * Optimized: 1 query with IN clause, returns single Histogram
 */
export async function getHistogram(
  recordTypes?: RecordType[]
): Promise<Histogram> {
  const types = recordTypes || await getRecordTypes();

  // Single query with IN clause for combined record types
  const result = await db.execute<BinRow>(sql`
    SELECT
      FLOOR(EXTRACT(YEAR FROM ${features.startDate}) / 50) * 50 as bin_start,
      COUNT(*) as count
    FROM ${features}
    WHERE ${features.recordType} IN ${types}
      AND ${features.startDate} IS NOT NULL
      AND ${features.endDate} IS NOT NULL
    GROUP BY bin_start
    ORDER BY bin_start
  `);

  // Build bin map from results
  const binMap = new Map<number, number>(
    result.rows.map(r => [parseInt(r.bin_start), parseInt(r.count)])
  );

  // Generate bins with full TimeSlice objects
  const bins: HistogramBin[] = TIME_SLICES.map(ts => ({
    timeSlice: ts,
    count: binMap.get(ts.startYear) || 0
  }));

  const totalFeatures = bins.reduce((sum, b) => sum + b.count, 0);
  const maxCount = Math.max(...bins.map(b => b.count), 0);

  return {
    bins,
    maxCount,
    timeRange: TIME_RANGE,
    totalFeatures
  };
}
