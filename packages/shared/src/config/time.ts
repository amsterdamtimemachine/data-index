import type { TimeSlice } from '../types/temporal';

export const TIME_SLICES: TimeSlice[] = [
  { key: '1500_1550', label: '1500-1550', startYear: 1500, endYear: 1550, durationYears: 50, timeRange: { start: '1500-01-01', end: '1550-12-31' } },
  { key: '1550_1600', label: '1550-1600', startYear: 1550, endYear: 1600, durationYears: 50, timeRange: { start: '1550-01-01', end: '1600-12-31' } },
  { key: '1600_1650', label: '1600-1650', startYear: 1600, endYear: 1650, durationYears: 50, timeRange: { start: '1600-01-01', end: '1650-12-31' } },
  { key: '1650_1700', label: '1650-1700', startYear: 1650, endYear: 1700, durationYears: 50, timeRange: { start: '1650-01-01', end: '1700-12-31' } },
  { key: '1700_1750', label: '1700-1750', startYear: 1700, endYear: 1750, durationYears: 50, timeRange: { start: '1700-01-01', end: '1750-12-31' } },
  { key: '1750_1800', label: '1750-1800', startYear: 1750, endYear: 1800, durationYears: 50, timeRange: { start: '1750-01-01', end: '1800-12-31' } },
  { key: '1800_1850', label: '1800-1850', startYear: 1800, endYear: 1850, durationYears: 50, timeRange: { start: '1800-01-01', end: '1850-12-31' } },
  { key: '1850_1900', label: '1850-1900', startYear: 1850, endYear: 1900, durationYears: 50, timeRange: { start: '1850-01-01', end: '1900-12-31' } },
  { key: '1900_1950', label: '1900-1950', startYear: 1900, endYear: 1950, durationYears: 50, timeRange: { start: '1900-01-01', end: '1950-12-31' } },
  { key: '1950_2000', label: '1950-2000', startYear: 1950, endYear: 2000, durationYears: 50, timeRange: { start: '1950-01-01', end: '2000-12-31' } },
  { key: '2000_2025', label: '2000-2025', startYear: 2000, endYear: 2025, durationYears: 25, timeRange: { start: '2000-01-01', end: '2025-12-31' } },
];

export const TIME_RANGE = {
  start: TIME_SLICES[0].timeRange.start,
  end: TIME_SLICES[TIME_SLICES.length - 1].timeRange.end
};
