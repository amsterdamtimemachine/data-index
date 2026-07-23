import { PRECOMP_TIME_BIN_YEARS, DISPLAY_TIME_BIN_MIN_YEARS, DISPLAY_TIME_BIN_MAX_YEARS } from '@atm/shared';

/**
 * Snap a requested display bin size to one cell_features can answer exactly: clamped to
 * [DISPLAY_TIME_BIN_MIN_YEARS, DISPLAY_TIME_BIN_MAX_YEARS] and rounded down to a multiple of PRECOMP_TIME_BIN_YEARS.
 *
 * A base bin is indivisible — a feature is recorded against the whole decade it touches —
 * so a 25-year display bin would have to split one, and the counts would be silently
 * wrong rather than merely coarse. Rounding is safe because generateTimeSlices anchors
 * slice starts to multiples of the bin size. The query layer applies this to every
 * requested bin size, so callers can forward the raw value.
 */
export function normaliseBinSize(binSize: number): number {
	const clamped = Math.min(Math.max(binSize, DISPLAY_TIME_BIN_MIN_YEARS), DISPLAY_TIME_BIN_MAX_YEARS);
	const snapped = Math.floor(clamped / PRECOMP_TIME_BIN_YEARS) * PRECOMP_TIME_BIN_YEARS;
	return Math.max(snapped, PRECOMP_TIME_BIN_YEARS);
}
