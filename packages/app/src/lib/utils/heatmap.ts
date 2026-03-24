import type { Heatmap, HeatmapDimensions, HeatmapCellBounds } from '@atm/shared/types';

/**
 * Calculate cell bounds for a specific cell
 */
export function calculateCellBounds(
	row: number,
	col: number,
	dimensions: HeatmapDimensions
): HeatmapCellBounds {
	const { minLon, maxLon, minLat, maxLat, colsAmount, rowsAmount } = dimensions;
	const cellWidth = (maxLon - minLon) / colsAmount;
	const cellHeight = (maxLat - minLat) / rowsAmount;

	const cellMinLon = minLon + col * cellWidth;
	const cellMinLat = minLat + row * cellHeight;

	let cellMaxLon = cellMinLon + cellWidth;
	let cellMaxLat = cellMinLat + cellHeight;

	// For the last column/row, use exact boundary to match inclusive assignment logic
	if (col === colsAmount - 1) {
		cellMaxLon = maxLon;
	}
	if (row === rowsAmount - 1) {
		cellMaxLat = maxLat;
	}

	return { minLon: cellMinLon, maxLon: cellMaxLon, minLat: cellMinLat, maxLat: cellMaxLat };
}

/**
 * Get cellId from row/col
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
 * Find cell bounds from cellId 
 */
export function getCellBoundsFromCellId(
	cellId: string,
	dimensions: HeatmapDimensions
): HeatmapCellBounds | null {
	const parsed = parseRowColFromCellId(cellId);
	if (!parsed) return null;

	const { row, col } = parsed;

	// Validate bounds
	if (row < 0 || row >= dimensions.rowsAmount || col < 0 || col >= dimensions.colsAmount) {
		return null;
	}

	return calculateCellBounds(row, col, dimensions);
}

/**
 * Generate cellId map (index -> cellId)
 */
export function generateCellIdMap(dimensions: HeatmapDimensions): Map<number, string> {
	const idMap = new Map<number, string>();

	for (let row = 0; row < dimensions.rowsAmount; row++) {
		for (let col = 0; col < dimensions.colsAmount; col++) {
			const index = row * dimensions.colsAmount + col;
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

export function generateCellGeometries(dimensions: HeatmapDimensions): CellGeometry[] {
	const geometries: CellGeometry[] = [];

	for (let row = 0; row < dimensions.rowsAmount; row++) {
		for (let col = 0; col < dimensions.colsAmount; col++) {
			const cellId = getCellIdFromRowCol(row, col);
			const bounds = calculateCellBounds(row, col, dimensions);

			// GeoJSON Polygon: [lon, lat] format, closed ring (first point === last point)
			const coordinates: [number, number][][] = [
				[
					[bounds.minLon, bounds.minLat],
					[bounds.maxLon, bounds.minLat],
					[bounds.maxLon, bounds.maxLat],
					[bounds.minLon, bounds.maxLat],
					[bounds.minLon, bounds.minLat]
				]
			];

			geometries.push({ cellId, row, col, coordinates });
		}
	}

	return geometries;
}

/**
 * Create an empty sparse heatmap
 */
export function createEmptyHeatmap(): Heatmap {
	return {
		indices: [],
		counts: []
	};
}

/**
 * Calculate density (0-1) from count using log normalization
 */
export function calculateDensity(count: number, maxCount: number): number {
	if (maxCount === 0 || count === 0) return 0;
	const maxTransformed = Math.log(maxCount + 1);
	return Math.log(count + 1) / maxTransformed;
}
