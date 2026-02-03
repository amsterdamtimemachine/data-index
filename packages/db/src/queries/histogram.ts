import { sql } from 'drizzle-orm';
import type { HistogramBin, Histograms, RecordType } from '@atm/shared';
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
 * Get histogram data for given record types
 */
export async function getHistogram(
  recordTypes?: RecordType[],
  tags?: string[]
): Promise<{ histograms: Histograms; processingTime: number }> {
  const t = Date.now();

  // Default to all record types if not specified
  const types = recordTypes || await getRecordTypes();

  const histograms: Histograms = {};

  for (const recordType of types) {
    // Query counts per time slice using FLOOR division
    // TODO: Add tag filtering when tags parameter is provided
    const result = await db.execute<BinRow>(sql`
      SELECT
        FLOOR(EXTRACT(YEAR FROM ${features.startDate}) / 50) * 50 as bin_start,
        COUNT(*) as count
      FROM ${features}
      WHERE ${features.recordType} = ${recordType}
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

    histograms[recordType] = {
      base: {
        bins,
        maxCount,
        timeRange: TIME_RANGE,
        totalFeatures
      },
      tags: {}
    };
  }

  return {
    histograms,
    processingTime: Date.now() - t
  };
}
