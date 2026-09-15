import type { Heatmap, HeatmapDimensions, HeatmapCellBounds } from '@atm/shared/types';
import proj4 from 'proj4';

// RD New / Amersfoort (EPSG:28992) → WGS84. Standard 7-parameter Bessel
// definition; accurate to sub-metre over the Netherlands — far finer than the
// 100m base cell. Used to draw heatmap cells on their true (rotated) footprint.
proj4.defs(
	'EPSG:28992',
	'+proj=sterea +lat_0=52.15616055555555 +lon_0=5.38763888888889 +k=0.9999079 ' +
		'+x_0=155000 +y_0=463000 +ellps=bessel ' +
		'+towgs84=565.417,50.3319,465.552,-0.398957,0.343988,-1.8774,4.0725 +units=m +no_defs'
);

/** Reproject an RD/28992 point (metres) to WGS84 [lon, lat]. */
function rdToWgs84(x: number, y: number): [number, number] {
	const [lon, lat] = proj4('EPSG:28992', 'WGS84', [x, y]);
	return [lon, lat];
}

/** Reproject a WGS84 point to RD/28992 [x, y] metres — the inverse of rdToWgs84. */
function wgs84ToRd(lon: number, lat: number): [number, number] {
	const [x, y] = proj4('WGS84', 'EPSG:28992', [lon, lat]);
	return [x, y];
}

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

function clamp(n: number, lo: number, hi: number): number {
	return Math.max(lo, Math.min(hi, n));
}

/**
 * Map a WGS84 point to the display cell containing it — the inverse of
 * calculateCellBounds, clamped into range so an edge/outside point resolves to the
 * nearest valid cell instead of out of bounds.
 */
export function getCellIdFromLonLat(lon: number, lat: number, dimensions: HeatmapDimensions): string {
	const { minLon, maxLon, minLat, maxLat, colsAmount, rowsAmount } = dimensions;
	const col = clamp(Math.floor(((lon - minLon) / (maxLon - minLon)) * colsAmount), 0, colsAmount - 1);
	const row = clamp(Math.floor(((lat - minLat) / (maxLat - minLat)) * rowsAmount), 0, rowsAmount - 1);
	return getCellIdFromRowCol(row, col);
}

/**
 * The cell under a WGS84 point, resolved the way the cells were drawn: in RD space
 * when the grid is reprojected (cells are axis-aligned squares there), in lon/lat
 * otherwise. O(1) arithmetic — no hit-testing against rendered geometry. Unlike
 * getCellIdFromLonLat this does not clamp: a point outside the grid is null.
 */
export function cellIdAtLonLat(
	lon: number,
	lat: number,
	dimensions: HeatmapDimensions,
	reprojected: boolean
): string | null {
	const { colsAmount, rowsAmount } = dimensions;
	const useRd =
		reprojected &&
		dimensions.rdOriginX != null &&
		dimensions.rdOriginY != null &&
		dimensions.rdCellWidth != null &&
		dimensions.rdCellHeight != null;

	let col: number;
	let row: number;
	if (useRd) {
		const { rdOriginX, rdOriginY, rdCellWidth, rdCellHeight } = dimensions as Required<HeatmapDimensions>;
		const [x, y] = wgs84ToRd(lon, lat);
		col = Math.floor((x - rdOriginX) / rdCellWidth);
		row = Math.floor((y - rdOriginY) / rdCellHeight);
	} else {
		const { minLon, maxLon, minLat, maxLat } = dimensions;
		col = Math.floor(((lon - minLon) / (maxLon - minLon)) * colsAmount);
		row = Math.floor(((lat - minLat) / (maxLat - minLat)) * rowsAmount);
	}
	if (col < 0 || col >= colsAmount || row < 0 || row >= rowsAmount) {
		return null;
	}
	return getCellIdFromRowCol(row, col);
}

/** Cells that were active before but are not any more — the only ones a heatmap
 * change has to zero, instead of resetting the whole grid. */
export function staleCells(previous: Iterable<string>, active: { has(id: string): boolean }): string[] {
	const stale: string[] = [];
	for (const id of previous) {
		if (!active.has(id)) {
			stale.push(id);
		}
	}
	return stale;
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

export function generateCellGeometries(
	dimensions: HeatmapDimensions,
	reproject = false
): CellGeometry[] {
	const geometries: CellGeometry[] = [];

	// When the backend ships the RD grid geometry and reprojection is enabled,
	// precompute a lattice of reprojected corners ((rows+1) × (cols+1)) so adjacent
	// cells share corners — one proj4 call per lattice point, not four per cell.
	const useRd =
		reproject &&
		dimensions.rdOriginX != null &&
		dimensions.rdOriginY != null &&
		dimensions.rdCellWidth != null &&
		dimensions.rdCellHeight != null;

	let lattice: [number, number][][] | null = null;
	if (useRd) {
		const { rdOriginX, rdOriginY, rdCellWidth, rdCellHeight, colsAmount, rowsAmount } =
			dimensions as Required<HeatmapDimensions>;
		lattice = [];
		for (let row = 0; row <= rowsAmount; row++) {
			const y = rdOriginY + row * rdCellHeight;
			const line: [number, number][] = [];
			for (let col = 0; col <= colsAmount; col++) {
				line.push(rdToWgs84(rdOriginX + col * rdCellWidth, y));
			}
			lattice.push(line);
		}
	}

	for (let row = 0; row < dimensions.rowsAmount; row++) {
		for (let col = 0; col < dimensions.colsAmount; col++) {
			const cellId = getCellIdFromRowCol(row, col);

			// GeoJSON Polygon: [lon, lat], closed ring (first === last), SW→SE→NE→NW→SW.
			let coordinates: [number, number][][];
			if (lattice) {
				coordinates = [
					[
						lattice[row][col],
						lattice[row][col + 1],
						lattice[row + 1][col + 1],
						lattice[row + 1][col],
						lattice[row][col]
					]
				];
			} else {
				const bounds = calculateCellBounds(row, col, dimensions);
				coordinates = [
					[
						[bounds.minLon, bounds.minLat],
						[bounds.maxLon, bounds.minLat],
						[bounds.maxLon, bounds.maxLat],
						[bounds.minLon, bounds.maxLat],
						[bounds.minLon, bounds.minLat]
					]
				];
			}

			geometries.push({ cellId, row, col, coordinates });
		}
	}

	return geometries;
}

/**
 * GeoJSON outline of a display-cell set: every cell edge not shared with another
 * cell in the set. Consumes the CellGeometry rings the map renders, so the
 * outline lands exactly on drawn cell borders (also in exact-reproject mode).
 */
export interface PlaceOutline {
	type: 'Feature';
	geometry: { type: 'MultiLineString'; coordinates: [number, number][][] };
	properties: Record<string, never>;
}

export function placeOutlineGeometry(
	cells: number[],
	geometries: CellGeometry[],
	colsAmount: number
): PlaceOutline {
	const inSet = new Set(cells);
	const lines: [number, number][][] = [];
	for (const idx of cells) {
		const cell = geometries[idx];
		if (!cell) {
			continue;
		}
		// ring is SW→SE→NE→NW→SW; an edge is kept when its neighbour is not in the set
		const ring = cell.coordinates[0];
		if (!inSet.has(idx - colsAmount)) {
			lines.push([ring[0], ring[1]]); // south
		}
		if (cell.col === colsAmount - 1 || !inSet.has(idx + 1)) {
			lines.push([ring[1], ring[2]]); // east
		}
		if (!inSet.has(idx + colsAmount)) {
			lines.push([ring[2], ring[3]]); // north
		}
		if (cell.col === 0 || !inSet.has(idx - 1)) {
			lines.push([ring[3], ring[0]]); // west
		}
	}
	return { type: 'Feature', geometry: { type: 'MultiLineString', coordinates: lines }, properties: {} };
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
