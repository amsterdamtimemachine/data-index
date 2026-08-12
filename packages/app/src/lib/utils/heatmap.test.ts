import { describe, test, expect } from 'vitest';
import type { HeatmapDimensions } from '@atm/shared/types';
import {
	calculateDensity,
	getCellIdFromRowCol,
	parseRowColFromCellId,
	calculateCellBounds,
	getCellBoundsFromCellId,
	getCellIdFromLonLat,
	generateCellIdMap,
	generateCellGeometries,
	createEmptyHeatmap
} from './heatmap';

// A simple 2×2 grid over a 10°(lon) × 20°(lat) box — easy exact maths.
const GRID: HeatmapDimensions = {
	colsAmount: 2,
	rowsAmount: 2,
	minLon: 0,
	maxLon: 10,
	minLat: 0,
	maxLat: 20
};

// Same 2×2 grid but with RD geometry, so the reprojection path engages. Origin is
// in central Amsterdam (RD metres); 1000m cells.
const RD_GRID: HeatmapDimensions = {
	...GRID,
	rdOriginX: 120000,
	rdOriginY: 485000,
	rdCellWidth: 1000,
	rdCellHeight: 1000
};

describe('calculateDensity (log-normalised)', () => {
	test('zero count or zero max → 0', () => {
		expect(calculateDensity(0, 10)).toBe(0);
		expect(calculateDensity(10, 0)).toBe(0);
	});
	test('count equal to max → 1', () => {
		expect(calculateDensity(10, 10)).toBeCloseTo(1, 10);
	});
	test('stays within [0,1] and is monotonic', () => {
		const a = calculateDensity(3, 100);
		const b = calculateDensity(30, 100);
		expect(a).toBeGreaterThan(0);
		expect(a).toBeLessThan(1);
		expect(b).toBeGreaterThan(a); // more count → higher density
	});
	test('log scaling compresses high counts (not linear)', () => {
		// log(11)/log(101) ≈ 0.52, well above the linear 0.10
		expect(calculateDensity(10, 100)).toBeGreaterThan(0.4);
	});
});

describe('cell id <-> row/col', () => {
	test('round-trips', () => {
		expect(getCellIdFromRowCol(2, 3)).toBe('2_3');
		expect(parseRowColFromCellId('2_3')).toEqual({ row: 2, col: 3 });
	});
	test('rejects malformed ids', () => {
		expect(parseRowColFromCellId('2')).toBeNull();
		expect(parseRowColFromCellId('1_2_3')).toBeNull();
		expect(parseRowColFromCellId('a_b')).toBeNull();
	});
});

describe('calculateCellBounds (uniform interpolation)', () => {
	test('first cell spans the first sub-rectangle', () => {
		expect(calculateCellBounds(0, 0, GRID)).toEqual({ minLon: 0, maxLon: 5, minLat: 0, maxLat: 10 });
	});
	test('last row/col snap to the exact grid max (inclusive boundary)', () => {
		expect(calculateCellBounds(1, 1, GRID)).toEqual({ minLon: 5, maxLon: 10, minLat: 10, maxLat: 20 });
	});
});

describe('getCellBoundsFromCellId', () => {
	test('valid id matches calculateCellBounds', () => {
		expect(getCellBoundsFromCellId('0_0', GRID)).toEqual(calculateCellBounds(0, 0, GRID));
	});
	test('out-of-range or malformed → null', () => {
		expect(getCellBoundsFromCellId('5_5', GRID)).toBeNull();
		expect(getCellBoundsFromCellId('nope', GRID)).toBeNull();
	});
});

describe('getCellIdFromLonLat (inverse of calculateCellBounds, clamped)', () => {
	// GRID: 2×2 over lon [0,10] (cellWidth 5), lat [0,20] (cellHeight 10).
	test('a point resolves to the cell that contains it', () => {
		expect(getCellIdFromLonLat(2, 5, GRID)).toBe('0_0');
		expect(getCellIdFromLonLat(7, 15, GRID)).toBe('1_1');
		expect(getCellIdFromLonLat(7, 5, GRID)).toBe('0_1');
	});
	test('the max edge clamps into range instead of overflowing', () => {
		expect(getCellIdFromLonLat(10, 20, GRID)).toBe('1_1'); // floor gives 2,2 → clamped to 1,1
	});
	test('points outside the grid clamp to the nearest edge cell', () => {
		expect(getCellIdFromLonLat(-5, -5, GRID)).toBe('0_0');
		expect(getCellIdFromLonLat(100, 100, GRID)).toBe('1_1');
	});
	test('the result always round-trips to valid bounds (never null)', () => {
		const id = getCellIdFromLonLat(10, 20, GRID);
		expect(getCellBoundsFromCellId(id, GRID)).not.toBeNull();
	});
});

describe('generateCellIdMap', () => {
	test('maps flat index (row*cols + col) → cellId', () => {
		const m = generateCellIdMap(GRID);
		expect(m.size).toBe(4);
		expect(m.get(0)).toBe('0_0');
		expect(m.get(1)).toBe('0_1');
		expect(m.get(2)).toBe('1_0');
		expect(m.get(3)).toBe('1_1');
	});
});

describe('createEmptyHeatmap', () => {
	test('is empty parallel arrays', () => {
		expect(createEmptyHeatmap()).toEqual({ indices: [], counts: [] });
	});
});

describe('generateCellGeometries — axis-aligned (default)', () => {
	test('produces one closed-ring polygon per cell', () => {
		const cells = generateCellGeometries(GRID);
		expect(cells).toHaveLength(4);
		for (const c of cells) {
			const ring = c.coordinates[0];
			expect(ring).toHaveLength(5);
			expect(ring[0]).toEqual(ring[4]); // closed
		}
	});
	test('cell (0,0) is the interpolated lon/lat rectangle', () => {
		const c = generateCellGeometries(GRID).find((g) => g.cellId === '0_0')!;
		expect(c.coordinates[0]).toEqual([
			[0, 0],
			[5, 0],
			[5, 10],
			[0, 10],
			[0, 0]
		]);
	});
	test('reproject=true with no RD geometry falls back to axis-aligned', () => {
		expect(generateCellGeometries(GRID, true)).toEqual(generateCellGeometries(GRID, false));
	});
});

describe('generateCellGeometries — reprojected (proj4, RD→WGS84)', () => {
	const cells = generateCellGeometries(RD_GRID, true);
	const cell00 = cells.find((c) => c.cellId === '0_0')!;
	// ring order is SW, SE, NE, NW, SW
	const [sw, se, ne, nw] = cell00.coordinates[0];

	test('corners land in the Amsterdam WGS84 bbox', () => {
		for (const [lon, lat] of [sw, se, ne, nw]) {
			expect(lon).toBeGreaterThan(4.7);
			expect(lon).toBeLessThan(5.1);
			expect(lat).toBeGreaterThan(52.3);
			expect(lat).toBeLessThan(52.45);
		}
	});

	test('orientation: +east → +lon, +north → +lat', () => {
		expect(se[0]).toBeGreaterThan(sw[0]); // east edge has larger lon
		expect(nw[1]).toBeGreaterThan(sw[1]); // north edge has larger lat
	});

	test('scale matches ~1km cells at 52°N (lon ≈ 0.0147°, lat ≈ 0.0090° per 1000m)', () => {
		expect(se[0] - sw[0]).toBeCloseTo(0.0147, 2);
		expect(nw[1] - sw[1]).toBeCloseTo(0.009, 2);
	});

	test('cells are rotated quads, not axis-aligned rectangles', () => {
		// RD grid-north is tilted ~0.4° from WGS84, so the west edge is not a constant
		// meridian: SW and NW have (slightly) different longitudes.
		expect(sw[0]).not.toBe(nw[0]);
	});

	test('adjacent cells share reprojected corners (single lattice, no seams)', () => {
		const cell01 = cells.find((c) => c.cellId === '0_1')!;
		// cell(0,0) SE corner === cell(0,1) SW corner
		expect(cell00.coordinates[0][1]).toEqual(cell01.coordinates[0][0]);
	});
});
