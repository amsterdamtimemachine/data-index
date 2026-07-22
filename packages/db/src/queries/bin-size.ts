import { BASE_BIN_SIZE, BIN_SIZE_MIN, BIN_SIZE_MAX } from '@atm/shared';

/**
 * Snap a requested display bin size to one cell_features can answer exactly: clamped to
 * [BIN_SIZE_MIN, BIN_SIZE_MAX] and rounded down to a multiple of BASE_BIN_SIZE.
 *
 * A base bin is indivisible — a feature is recorded against the whole decade it touches —
 * so a 25-year display bin would have to split one, and the counts would be silently
 * wrong rather than merely coarse. Rounding is safe because generateTimeSlices anchors
 * slice starts to multiples of the bin size. The query layer applies this to every
 * requested bin size, so callers can forward the raw value.
 */
export function normaliseBinSize(binSize: number): number {
	const clamped = Math.min(Math.max(binSize, BIN_SIZE_MIN), BIN_SIZE_MAX);
	const snapped = Math.floor(clamped / BASE_BIN_SIZE) * BASE_BIN_SIZE;
	return Math.max(snapped, BASE_BIN_SIZE);
}
