/** The shared date parser: a source's year, month or day, its period, and the reverse. */
import { describe, test, expect } from 'bun:test';
import { parsePartialDate, partialDateRange, periodAsPartialDate, formatIsoDate } from '@atm/shared';

describe('parsePartialDate', () => {
  test('a day, a month and a year, with or without xx placeholders', () => {
    expect(parsePartialDate('1934-01-05')).toEqual({ year: 1934, month: 1, day: 5 });
    expect(parsePartialDate('1907-05')).toEqual({ year: 1907, month: 5 });
    expect(parsePartialDate('1907-05-xx')).toEqual({ year: 1907, month: 5 });
    expect(parsePartialDate('1928')).toEqual({ year: 1928 });
    expect(parsePartialDate('1928-xx-xx')).toEqual({ year: 1928 });
  });

  test('rejects what is not a date or cannot exist', () => {
    expect(parsePartialDate('1934-02-30')).toBeNull();
    expect(parsePartialDate('1934-13')).toBeNull();
    expect(parsePartialDate('1910-01-174')).toBeNull();
    expect(parsePartialDate('1928-xx-05')).toBeNull();
    expect(parsePartialDate('')).toBeNull();
  });
});

describe('partialDateRange', () => {
  test('the day, the whole month or the whole year', () => {
    expect(partialDateRange({ year: 1934, month: 1, day: 5 })).toEqual({ startDate: '1934-01-05', endDate: '1934-01-05' });
    expect(partialDateRange({ year: 1907, month: 2 })).toEqual({ startDate: '1907-02-01', endDate: '1907-02-28' });
    expect(partialDateRange({ year: 1928 })).toEqual({ startDate: '1928-01-01', endDate: '1928-12-31' });
  });
});

describe('periodAsPartialDate', () => {
  test('reads a whole year, a whole month or one day back', () => {
    expect(periodAsPartialDate('1928-01-01', '1928-12-31')).toEqual({ year: 1928 });
    expect(periodAsPartialDate('1907-05-01', '1907-05-31')).toEqual({ year: 1907, month: 5 });
    expect(periodAsPartialDate('1934-01-05', '1934-01-05')).toEqual({ year: 1934, month: 1, day: 5 });
  });

  test('anything else is not a single date', () => {
    expect(periodAsPartialDate('1934-01-05', '1935-03-02')).toBeNull();
    expect(periodAsPartialDate('1907-05-01', '1907-05-30')).toBeNull();
    expect(periodAsPartialDate('1928', '1928')).toBeNull();
  });
});

describe('formatIsoDate', () => {
  test('writes a date at its precision', () => {
    expect(formatIsoDate({ year: 1907, month: 5, day: 2 })).toBe('1907-05-02');
    expect(formatIsoDate({ year: 1907, month: 5 })).toBe('1907-05');
    expect(formatIsoDate({ year: 1907 })).toBe('1907');
  });
});
