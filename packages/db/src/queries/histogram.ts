import { sql } from 'drizzle-orm';
import type { Histogram, HistogramBin, RecordType, PlaceType } from '@atm/shared';
import { DEFAULT_BIN_SIZE } from '@atm/shared';
import { normaliseBinSize } from './bin-size';
import { db } from '../client';
import { cellFeatures } from '../schema';
import type { CountRow } from '../row-types';
import { computeTimeSlices, computeTimeRange } from './time-slices';
import { getRecordTypes } from './record-types';
import { countExpr, displayBinExpr, categoryFilter, binWindow } from './cell-features';

// Query result types
type BinRow = { bin_start: string; count: string };

/**
 * Get histogram data for combined record types.
 *
 * Reads the same cell_features buckets as the heatmap, just summed over space
 * instead of grouped by cell — so the two can't disagree about how many features
 * a period holds. (This is why it counts features that are *on the map*: a feature
 * whose place has no geometry has no cells and so appears in neither. buildCellFeatures
 * warns when any exist; ingest should make that impossible.)
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

  binSizeYears = normaliseBinSize(binSizeYears);

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
    SELECT (${displayBinExpr(binSizeYears)})::text as bin_start, ${countExpr} as count
    FROM ${cellFeatures}
    WHERE ${categoryFilter(types, datasetIds, placeTypes)}
      AND ${binWindow(firstSlice.startYear, lastSlice.endYear)}
    GROUP BY 1
    ORDER BY 1
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
  // date range spans multiple bins (it is counted once per bin it touches). Unioning
  // every bucket's bitmap collapses it back to one set.
  const totalResult = await db.execute<CountRow>(sql`
    SELECT ${countExpr} as count
    FROM ${cellFeatures}
    WHERE ${categoryFilter(types, datasetIds, placeTypes)}
      AND ${binWindow(firstSlice.startYear, lastSlice.endYear)}
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
