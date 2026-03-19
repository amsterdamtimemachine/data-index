import { sql } from 'drizzle-orm';
import type { TimeSlice, TimeRange } from '@atm/shared';
import { DEFAULT_BIN_SIZE } from '@atm/shared';
import { db } from '../client';
import { features } from '../schema';
import { createTTLCache } from './cache';

type DateRangeRow = { min_year: string; max_year: string };

// Per-binSize TTL cache
const cacheMap = new Map<number, ReturnType<typeof createTTLCache<TimeSlice[]>>>();

function getCache(binSize: number) {
  if (!cacheMap.has(binSize)) {
    cacheMap.set(binSize, createTTLCache<TimeSlice[]>(10 * 60 * 1000));
  }
  return cacheMap.get(binSize)!;
}

function buildTimeSlice(startYear: number, endYear: number): TimeSlice {
  const duration = endYear - startYear;
  return {
    key: `${startYear}_${endYear}`,
    label: `${startYear}-${endYear}`,
    startYear,
    endYear,
    durationYears: duration,
    timeRange: {
      start: `${startYear}-01-01`,
      end: `${endYear}-12-31`
    }
  };
}

/**
 * Compute time slices from actual data extent.
 * Bins are anchored to round boundaries (multiples of binSize).
 */
export async function computeTimeSlices(binSizeYears: number = DEFAULT_BIN_SIZE): Promise<TimeSlice[]> {
  const cache = getCache(binSizeYears);
  const cached = cache.get();
  if (cached) return cached;

  const result = await db.execute<DateRangeRow>(sql`
    SELECT
      EXTRACT(YEAR FROM MIN(${features.startDate}))::int as min_year,
      EXTRACT(YEAR FROM MAX(${features.endDate}))::int as max_year
    FROM ${features}
    WHERE ${features.startDate} IS NOT NULL
      AND ${features.endDate} IS NOT NULL
  `);

  const minYear = parseInt(result.rows[0].min_year);
  const maxYear = parseInt(result.rows[0].max_year);

  // Anchor to round boundaries
  const flooredStart = Math.floor(minYear / binSizeYears) * binSizeYears;
  const ceiledEnd = Math.ceil((maxYear + 1) / binSizeYears) * binSizeYears;

  const slices: TimeSlice[] = [];
  for (let start = flooredStart; start < ceiledEnd; start += binSizeYears) {
    slices.push(buildTimeSlice(start, start + binSizeYears));
  }

  cache.set(slices);
  return slices;
}

/**
 * Derive time range from computed slices.
 */
export async function computeTimeRange(binSizeYears: number = DEFAULT_BIN_SIZE): Promise<TimeRange> {
  const slices = await computeTimeSlices(binSizeYears);
  return {
    start: slices[0].timeRange.start,
    end: slices[slices.length - 1].timeRange.end
  };
}
