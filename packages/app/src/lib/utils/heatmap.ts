import type { Heatmap, HeatmapTimeline, RecordType, HeatmapBlueprint, HeatmapBlueprintMetadata, HeatmapCellBounds } from '@atm/shared/types';

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

/**
 * Calculate cell bounds for a specific cell - matches preprocessor logic exactly
 * This is the CLIENT-SIDE equivalent of packages/preprocessor/src/visualization/heatmap.ts:calculateCellBounds()
 */
export function calculateCellBounds(
	row: number,
	col: number,
	blueprint: HeatmapBlueprintMetadata
): HeatmapCellBounds {
	const cellWidth = (blueprint.bounds.maxLon - blueprint.bounds.minLon) / blueprint.cols;
	const cellHeight = (blueprint.bounds.maxLat - blueprint.bounds.minLat) / blueprint.rows;

	const minLon = blueprint.bounds.minLon + (col * cellWidth);
	const minLat = blueprint.bounds.minLat + (row * cellHeight);

	let maxLon = minLon + cellWidth;
	let maxLat = minLat + cellHeight;

	// For the last column/row, use exact boundary to match inclusive assignment logic
	if (col === blueprint.cols - 1) { maxLon = blueprint.bounds.maxLon; }
	if (row === blueprint.rows - 1) { maxLat = blueprint.bounds.maxLat; }

	return { minLon, maxLon, minLat, maxLat };
}

/**
 * Get cellId from row/col - matches preprocessor format exactly
 */
export function getCellIdFromRowCol(row: number, col: number): string {
	return `${row}_${col}`;
}

/**
 * Parse cellId back to row/col
 */
export function parseRowColFromCellId(cellId: string): { row: number; col: number } | null {
	const parts = cellId.split('_');
	if (parts.length !== 2) return null;

	const row = parseInt(parts[0], 10);
	const col = parseInt(parts[1], 10);

	if (isNaN(row) || isNaN(col)) return null;
	return { row, col };
}

/**
 * Find cell bounds from cellId - convenience function
 */
export function getCellBoundsFromCellId(
	cellId: string,
	blueprint: HeatmapBlueprintMetadata
): HeatmapCellBounds | null {
	const parsed = parseRowColFromCellId(cellId);
	if (!parsed) return null;

	const { row, col } = parsed;

	// Validate bounds
	if (row < 0 || row >= blueprint.rows || col < 0 || col >= blueprint.cols) {
		return null;
	}

	return calculateCellBounds(row, col, blueprint);
}

/**
 * Generate cellId map (index -> cellId) - matches Map.svelte's current usage
 */
export function generateCellIdMap(blueprint: HeatmapBlueprintMetadata): Map<number, string> {
	const idMap = new Map<number, string>();

	for (let row = 0; row < blueprint.rows; row++) {
		for (let col = 0; col < blueprint.cols; col++) {
			const index = row * blueprint.cols + col;
			const cellId = getCellIdFromRowCol(row, col);
			idMap.set(index, cellId);
		}
	}

	return idMap;
}

/**
 * Generate GeoJSON cell definitions - matches Map.svelte's current usage
 */
export interface CellGeometry {
	cellId: string;
	row: number;
	col: number;
	coordinates: [number, number][][]; // GeoJSON Polygon coordinates
}

export function generateCellGeometries(blueprint: HeatmapBlueprintMetadata): CellGeometry[] {
	const geometries: CellGeometry[] = [];

	for (let row = 0; row < blueprint.rows; row++) {
		for (let col = 0; col < blueprint.cols; col++) {
			const cellId = getCellIdFromRowCol(row, col);
			const bounds = calculateCellBounds(row, col, blueprint);

			// GeoJSON Polygon: [lon, lat] format, closed ring (first point === last point)
			const coordinates = [[
				[bounds.minLon, bounds.minLat],
				[bounds.maxLon, bounds.minLat],
				[bounds.maxLon, bounds.maxLat],
				[bounds.minLon, bounds.maxLat],
				[bounds.minLon, bounds.minLat]
			]];

			geometries.push({ cellId, row, col, coordinates });
		}
	}

	return geometries;
}
