import { describe, test, expect } from 'bun:test';
import { PRECOMP_TIME_BIN_YEARS, DISPLAY_TIME_BIN_MIN_YEARS, DISPLAY_TIME_BIN_MAX_YEARS } from '@atm/shared';
import { normaliseBinSize } from './bin-size';

// These assume the defaults (PRECOMP_TIME_BIN_YEARS=10, DISPLAY_TIME_BIN_MIN_YEARS=10, DISPLAY_TIME_BIN_MAX_YEARS=100). The
// snap-to-multiple is what keeps the cell_features rollup exact: a display bin must be a
// whole number of base bins, so a bin size that would split one is floored to fit.
describe('normaliseBinSize', () => {
  test('passes through an in-range multiple of PRECOMP_TIME_BIN_YEARS unchanged', () => {
    expect(normaliseBinSize(50)).toBe(50);
    expect(normaliseBinSize(DISPLAY_TIME_BIN_MIN_YEARS)).toBe(DISPLAY_TIME_BIN_MIN_YEARS);
    expect(normaliseBinSize(DISPLAY_TIME_BIN_MAX_YEARS)).toBe(DISPLAY_TIME_BIN_MAX_YEARS);
  });

  test('floors a non-multiple down to a multiple of PRECOMP_TIME_BIN_YEARS', () => {
    expect(normaliseBinSize(25)).toBe(20); // must not split a decade
    expect(normaliseBinSize(55)).toBe(50);
    expect(normaliseBinSize(99)).toBe(90);
  });

  test('clamps below the minimum up to a valid bin (never 0)', () => {
    expect(normaliseBinSize(5)).toBe(DISPLAY_TIME_BIN_MIN_YEARS);
    expect(normaliseBinSize(3)).toBe(DISPLAY_TIME_BIN_MIN_YEARS);
    expect(normaliseBinSize(0)).toBe(DISPLAY_TIME_BIN_MIN_YEARS);
  });

  test('clamps above the maximum down to the max', () => {
    expect(normaliseBinSize(200)).toBe(DISPLAY_TIME_BIN_MAX_YEARS);
    expect(normaliseBinSize(105)).toBe(DISPLAY_TIME_BIN_MAX_YEARS);
  });

  test('always returns a multiple of PRECOMP_TIME_BIN_YEARS, never below it', () => {
    for (let n = 1; n <= 250; n++) {
      const out = normaliseBinSize(n);
      expect(out % PRECOMP_TIME_BIN_YEARS).toBe(0);
      expect(out).toBeGreaterThanOrEqual(PRECOMP_TIME_BIN_YEARS);
    }
  });
});
