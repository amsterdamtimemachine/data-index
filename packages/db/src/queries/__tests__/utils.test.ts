import { describe, test, expect } from 'bun:test';
import { formatDateRange } from '../../etl/helpers/helpers';

describe('formatDateRange', () => {
  test('formats range from two different dates', () => {
    expect(formatDateRange('1948-09-01', '1948-09-30')).toBe('1948-09-01/1948-09-30');
  });

  test('returns single date when start equals end', () => {
    expect(formatDateRange('1948-09-01', '1948-09-01')).toBe('1948-09-01');
  });

  test('returns start date when end is null', () => {
    expect(formatDateRange('1948-09-01', null)).toBe('1948-09-01');
  });

  test('returns undefined when both null', () => {
    expect(formatDateRange(null, null)).toBeUndefined();
  });

  test('returns undefined when start is null', () => {
    expect(formatDateRange(null, '1948-09-30')).toBeUndefined();
  });
});
