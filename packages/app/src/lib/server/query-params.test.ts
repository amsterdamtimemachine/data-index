/**
 * The query-string boundary: absent bounds are the caller's decision (undefined),
 * malformed bounds are a 400, and list params are capped so a crafted URL can't
 * force an oversized IN (...) query.
 */
import { describe, test, expect } from 'vitest';
import { MAX_FILTER_ITEMS, DISPLAY_GRID_DEFAULT_COLS, DISPLAY_GRID_MIN_COLS, DISPLAY_GRID_MAX_COLS } from '@atm/shared';
import { parseBounds, parseList, parseGridCols } from './query-params';

function url(qs: string): URL {
	return new URL(`http://test/api/x${qs}`);
}

function expect400(fn: () => unknown, code: string) {
	try {
		fn();
	} catch (err) {
		const httpError = err as { status?: number; body?: { code?: string } };
		expect(httpError.status).toBe(400);
		expect(httpError.body?.code).toBe(code);
		return;
	}
	throw new Error('expected a 400 to be thrown');
}

describe('parseBounds', () => {
	test('absent entirely → undefined (caller decides if bounds are required)', () => {
		expect(parseBounds(url(''))).toBeUndefined();
	});

	test('partial params → undefined', () => {
		expect(parseBounds(url('?minLon=4.8&maxLon=4.9'))).toBeUndefined();
	});

	test('all four present → parsed numbers', () => {
		expect(parseBounds(url('?minLon=4.8&maxLon=4.9&minLat=52.3&maxLat=52.4'))).toEqual({
			minLon: 4.8,
			maxLon: 4.9,
			minLat: 52.3,
			maxLat: 52.4
		});
	});

	test('non-numeric → 400 INVALID_BOUNDS', () => {
		expect400(() => parseBounds(url('?minLon=abc&maxLon=4.9&minLat=52.3&maxLat=52.4')), 'INVALID_BOUNDS');
	});

	test('inverted box → 400 INVALID_BOUNDS', () => {
		expect400(() => parseBounds(url('?minLon=4.9&maxLon=4.8&minLat=52.3&maxLat=52.4')), 'INVALID_BOUNDS');
	});

	test('degenerate (zero-area) box → 400 INVALID_BOUNDS', () => {
		expect400(() => parseBounds(url('?minLon=4.8&maxLon=4.8&minLat=52.3&maxLat=52.4')), 'INVALID_BOUNDS');
	});
});

describe('parseList', () => {
	test('absent or empty → undefined', () => {
		expect(parseList(url(''), 'tags')).toBeUndefined();
		expect(parseList(url('?tags='), 'tags')).toBeUndefined();
		expect(parseList(url('?tags=,,'), 'tags')).toBeUndefined();
	});

	test('trims items and drops empties', () => {
		expect(parseList(url('?tags=a,%20b%20,,c'), 'tags')).toEqual(['a', 'b', 'c']);
	});

	test('caps at MAX_FILTER_ITEMS', () => {
		const many = Array.from({ length: MAX_FILTER_ITEMS + 10 }, (_, i) => `t${i}`).join(',');
		expect(parseList(url(`?tags=${many}`), 'tags')?.length).toBe(MAX_FILTER_ITEMS);
	});
});

describe('parseGridCols', () => {
	test('absent or malformed falls back to the default width', () => {
		expect(parseGridCols(url(''))).toBe(DISPLAY_GRID_DEFAULT_COLS);
		expect(parseGridCols(url('?cols=wide'))).toBe(DISPLAY_GRID_DEFAULT_COLS);
	});

	test('a width is clamped to the allowed range', () => {
		expect(parseGridCols(url('?cols=50'))).toBe(50);
		expect(parseGridCols(url('?cols=1'))).toBe(DISPLAY_GRID_MIN_COLS);
		expect(parseGridCols(url('?cols=100000'))).toBe(DISPLAY_GRID_MAX_COLS);
	});
});
