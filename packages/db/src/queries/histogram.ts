import { sql } from 'drizzle-orm';
import type { Histogram, HistogramBin, RecordType, PlaceType } from '@atm/shared';
import { DEFAULT_BIN_SIZE } from '@atm/shared';
import { db } from '../client';
import { features } from '../schema';
import { computeTimeSlices, computeTimeRange } from './time-slices';
import { getRecordTypes } from './record-types';
import { featureYearOverlap, slicesCTE } from './time-filter';
import { andIn, placeTypeJoin } from './filters';

// Query result types
type BinRow = { bin_start: string; count: string };

/**
 * Get histogram data for combined record types
 */
export async function getHistogram(
  recordTypes?: RecordType[],
  datasetIds?: string[],
  placeTypes?: PlaceType[],
  binSizeYears: number = DEFAULT_BIN_SIZE
): Promise<Histogram> {
  const types = recordTypes || await getRecordTypes();

  if (types.length === 0) {
    return { bins: [], maxCount: 0, timeRange: { start: '', end: '' }, totalFeatures: 0 };
  }

  const [timeSlices, timeRange] = await Promise.all([
    computeTimeSlices(binSizeYears),
    computeTimeRange(binSizeYears)
  ]);

  if (timeSlices.length === 0) {
    return { bins: [], maxCount: 0, timeRange, totalFeatures: 0 };
  }

  const firstSlice = timeSlices[0];
  const lastSlice = timeSlices[timeSlices.length - 1];

  const result = await db.execute<BinRow>(sql`
    WITH ${slicesCTE(firstSlice.startYear, lastSlice.startYear, binSizeYears)}
    SELECT s.bin_start::text as bin_start, COUNT(DISTINCT f.id) as count
    FROM ${features} f
    ${placeTypeJoin(placeTypes, sql`f.id`)}
    JOIN slices s ON ${featureYearOverlap(sql`f.start_date`, sql`f.end_date`, sql`s.bin_start`, sql`s.bin_end`)}
    WHERE f.record_type IN ${types}
      ${andIn(sql`f.dataset_id`, datasetIds)}
      ${andIn(sql`p.type`, placeTypes)}
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

  // True distinct total. Summing bin counts would over-count any feature whose
  // date range spans multiple bins (COUNT DISTINCT counts it once per bin).
  const totalResult = await db.execute<{ count: string }>(sql`
    SELECT COUNT(DISTINCT f.id) as count
    FROM ${features} f
    ${placeTypeJoin(placeTypes, sql`f.id`)}
    WHERE f.record_type IN ${types}
      ${andIn(sql`f.dataset_id`, datasetIds)}
      ${andIn(sql`p.type`, placeTypes)}
      AND ${featureYearOverlap(sql`f.start_date`, sql`f.end_date`, firstSlice.startYear, lastSlice.endYear)}
  `);
  const totalFeatures = parseInt(totalResult.rows[0].count);
  const maxCount = Math.max(...bins.map(b => b.count), 0);

  return {
    bins,
    maxCount,
    timeRange,
    totalFeatures
  };
}
