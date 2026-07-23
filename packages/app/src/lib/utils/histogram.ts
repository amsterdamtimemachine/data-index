import type { HistogramBin } from '@atm/shared/types';

/**
 * Calculate normalized bar heights for histogram visualization
 * Applies logarithmic scaling and normalizes to maxHeight
 */
export function calculateHistogramBarHeights(
	bins: HistogramBin[],
	maxCount: number,
	maxHeight: number = 40,
	minHeight: number = 2
): number[] {
	if (maxCount === 0) {
		return bins.map(() => 0);
	}

	// Apply logarithmic transformation for better visual distribution
	const maxTransformed = Math.log(maxCount + 1);

	return bins.map((bin) => {
		if (bin.count === 0) return 0;

		// Log transform and normalize
		const logValue = Math.log(bin.count + 1);
		const normalizedValue = logValue / maxTransformed;
		const scaledHeight = normalizedValue * maxHeight;

		// Ensure minimum height for visibility
		return Math.max(scaledHeight, minHeight);
	});
}
