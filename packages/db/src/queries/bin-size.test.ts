import { describe, test, expect } from 'bun:test';
import { BASE_BIN_SIZE, BIN_SIZE_MIN, BIN_SIZE_MAX } from '@atm/shared';
import { normaliseBinSize } from './bin-size';

// These assume the defaults (BASE_BIN_SIZE=10, BIN_SIZE_MIN=10, BIN_SIZE_MAX=100). The
// snap-to-multiple is what keeps the cell_features rollup exact: a display bin must be a
// whole number of base bins, so a bin size that would split one is floored to fit.
describe('normaliseBinSize', () => {
  test('passes through an in-range multiple of BASE_BIN_SIZE unchanged', () => {
    expect(normaliseBinSize(50)).toBe(50);
    expect(normaliseBinSize(BIN_SIZE_MIN)).toBe(BIN_SIZE_MIN);
    expect(normaliseBinSize(BIN_SIZE_MAX)).toBe(BIN_SIZE_MAX);
  });

  test('floors a non-multiple down to a multiple of BASE_BIN_SIZE', () => {
    expect(normaliseBinSize(25)).toBe(20); // must not split a decade
    expect(normaliseBinSize(55)).toBe(50);
    expect(normaliseBinSize(99)).toBe(90);
  });

  test('clamps below the minimum up to a valid bin (never 0)', () => {
    expect(normaliseBinSize(5)).toBe(BIN_SIZE_MIN);
    expect(normaliseBinSize(3)).toBe(BIN_SIZE_MIN);
    expect(normaliseBinSize(0)).toBe(BIN_SIZE_MIN);
  });

  test('clamps above the maximum down to the max', () => {
    expect(normaliseBinSize(200)).toBe(BIN_SIZE_MAX);
    expect(normaliseBinSize(105)).toBe(BIN_SIZE_MAX);
  });

  test('always returns a multiple of BASE_BIN_SIZE, never below it', () => {
    for (let n = 1; n <= 250; n++) {
      const out = normaliseBinSize(n);
      expect(out % BASE_BIN_SIZE).toBe(0);
      expect(out).toBeGreaterThanOrEqual(BASE_BIN_SIZE);
    }
  });
});
