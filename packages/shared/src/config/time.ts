// Default bin size for time slices (years)
export const DEFAULT_BIN_SIZE = parseInt(process.env.DEFAULT_BIN_SIZE || '50', 10) || 50;

// Validation bounds for configurable bin size
export const BIN_SIZE_MIN = parseInt(process.env.BIN_SIZE_MIN || '10', 10) || 10;
export const BIN_SIZE_MAX = parseInt(process.env.BIN_SIZE_MAX || '100', 10) || 100;

// Width of the base time bin (years). cell_features buckets features per base bin
// at rebuild-index time; display bins are unions of whole base bins, so a display
// bin size that isn't a multiple of this can't be answered exactly.
export const BASE_BIN_SIZE = parseInt(process.env.BASE_BIN_SIZE || '10', 10) || 10;

/**
 * Snap a requested bin size to the display grid cell_features can answer exactly:
 * clamped to [BIN_SIZE_MIN, BIN_SIZE_MAX] and rounded down to a multiple of
 * BASE_BIN_SIZE.
 *
 * A base bin is indivisible — a feature is recorded against the whole decade it
 * touches, so a 25-year display bin would have to split one, and the counts would
 * be silently wrong rather than merely coarse. Rounding is safe because
 * generateTimeSlices already anchors slice starts to multiples of the bin size.
 */
export function normaliseBinSize(binSize: number): number {
  const clamped = Math.min(Math.max(binSize, BIN_SIZE_MIN), BIN_SIZE_MAX);
  const snapped = Math.floor(clamped / BASE_BIN_SIZE) * BASE_BIN_SIZE;
  return Math.max(snapped, BASE_BIN_SIZE);
}

/** Whether a bin size can be answered exactly from the base bins. */
export function isAlignedBinSize(binSize: number): boolean {
  return Number.isInteger(binSize) && binSize % BASE_BIN_SIZE === 0;
}
