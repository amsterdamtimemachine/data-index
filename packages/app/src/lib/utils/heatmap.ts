import type { Heatmap, HeatmapTimeline, RecordType, HeatmapBlueprint } from '@atm/shared/types';

/**
 * Merge multiple sparse heatmaps into a single sparse heatmap
 * All heatmaps must have the same grid dimensions
 *
 * @param heatmaps Array of sparse heatmaps to merge
 * @param blueprint Optional heatmap blueprint for grid size validation
 * @returns Single merged sparse heatmap with combined counts and recalculated density
 */
export function mergeHeatmaps(heatmaps: Heatmap[], blueprint?: HeatmapBlueprint): Heatmap {
	// Filter out invalid heatmaps
	const validHeatmaps = heatmaps.filter(
		(heatmap) =>
			heatmap && heatmap.indices && heatmap.counts && heatmap.densities && heatmap.dimensions
	);

	if (validHeatmaps.length === 0) {
		// Return empty sparse heatmap
		let rows = 0;
		let cols = 0;

		if (blueprint) {
			if (blueprint.rows > 0 && blueprint.cols > 0) {
				rows = blueprint.rows;
				cols = blueprint.cols;
			}
		}

		return {
			indices: [],
			counts: [],
			densities: [],
			dimensions: { rows, cols }
		};
	}

	if (validHeatmaps.length === 1) {
		return validHeatmaps[0];
	}

	// Get dimensions from first valid heatmap
	const { rows, cols } = validHeatmaps[0].dimensions;
	const gridSize = rows * cols;

	// Validate all heatmaps have same dimensions
	for (let i = 1; i < validHeatmaps.length; i++) {
		const dims = validHeatmaps[i].dimensions;
		if (dims.rows !== rows || dims.cols !== cols) {
			throw new Error(
				`Heatmap dimension mismatch: expected ${rows}x${cols}, got ${dims.rows}x${dims.cols}`
			);
		}
	}

	// Merge sparse heatmaps by accumulating counts in a dense temporary array
	const tempCounts = new Array(gridSize).fill(0);

	// Accumulate all counts
	for (const heatmap of validHeatmaps) {
		for (let j = 0; j < heatmap.indices.length; j++) {
			const cellIndex = heatmap.indices[j];
			tempCounts[cellIndex] += heatmap.counts[j];
		}
	}

	// Convert back to sparse format - only non-zero cells
	const mergedIndices: number[] = [];
	const mergedCounts: number[] = [];

	for (let cellIndex = 0; cellIndex < gridSize; cellIndex++) {
		if (tempCounts[cellIndex] > 0) {
			mergedIndices.push(cellIndex);
			mergedCounts.push(tempCounts[cellIndex]);
		}
	}

	// Recalculate density using logarithmic transformation
	const mergedDensities: number[] = [];
	if (mergedCounts.length > 0) {
		const maxCount = Math.max(...mergedCounts);
		const maxTransformed = Math.log(maxCount + 1);

		for (const count of mergedCounts) {
			mergedDensities.push(Math.log(count + 1) / maxTransformed);
		}
	}

	return {
		indices: mergedIndices,
		counts: mergedCounts,
		densities: mergedDensities,
		dimensions: { rows, cols }
	};
}

/**
 * Merge heatmaps from multiple recordTypes within a time slice
 *
 * @param timeSliceData Data for a specific time slice containing multiple recordTypes
 * @param recordTypes Array of recordTypes to merge
 * @returns Merged heatmap or null if no valid data
 */
export function mergeTimeSliceHeatmaps(
	timeSliceData: any,
	recordTypes: RecordType[]
): Heatmap | null {
	const heatmapsToMerge: Heatmap[] = [];

	// Collect base heatmaps from all requested recordTypes
	for (const recordType of recordTypes) {
		const recordTypeData = timeSliceData[recordType];
		if (recordTypeData?.base) {
			heatmapsToMerge.push(recordTypeData.base);
		}
	}

	if (heatmapsToMerge.length === 0) {
		return null;
	}

	return mergeHeatmaps(heatmapsToMerge);
}

/**
 * Merge multiple HeatmapTimelines into a single timeline with merged recordTypes
 * This creates a new timeline where each time slice contains merged heatmaps
 *
 * @param timeline Original HeatmapTimeline containing multiple recordTypes
 * @param recordTypes Array of recordTypes to merge
 * @param selectedTags Optional tags to use instead of base heatmaps (supports combinations)
 * @param blueprint Optional heatmap blueprint for grid size validation
 * @returns New HeatmapTimeline with merged recordTypes for smooth navigation
 */
export function mergeHeatmapTimeline(
	timeline: HeatmapTimeline,
	recordTypes: RecordType[],
	selectedTags?: string[],
	blueprint?: HeatmapBlueprint
): HeatmapTimeline {
	const mergedTimeline: HeatmapTimeline = {};

	// Process each time slice
	for (const [timeSliceKey, timeSliceData] of Object.entries(timeline)) {
		const heatmapsToMerge: Heatmap[] = [];

		// Collect heatmaps from all requested recordTypes for this time slice
		for (const recordType of recordTypes) {
			const recordTypeData = timeSliceData[recordType];

			if (recordTypeData) {
				if (selectedTags && selectedTags.length > 0) {
					// Use tag combination or individual tag heatmap
					const tagKey = selectedTags.length > 1 ? selectedTags.sort().join('+') : selectedTags[0];
					if (recordTypeData.tags[tagKey]) {
						heatmapsToMerge.push(recordTypeData.tags[tagKey]);
					}
				} else if (recordTypeData.base) {
					// Use base heatmap
					heatmapsToMerge.push(recordTypeData.base);
				}
			}
		}

		// Only include time slices that have data from at least one recordType
		if (heatmapsToMerge.length > 0) {
			const mergedHeatmap = mergeHeatmaps(heatmapsToMerge, blueprint);

			// Create a combined recordType key (e.g., "text+image")
			const combinedRecordType = recordTypes.sort().join('+') as RecordType;

			// Structure the merged data as a single recordType in the timeline
			const tagKey =
				selectedTags && selectedTags.length > 0
					? selectedTags.length > 1
						? selectedTags.sort().join('+')
						: selectedTags[0]
					: undefined;

			mergedTimeline[timeSliceKey] = {
				[combinedRecordType]: {
					base: mergedHeatmap,
					tags: tagKey ? { [tagKey]: mergedHeatmap } : {}
				}
			} as any;
		}
	}

	return mergedTimeline;
}
