import { describe, test, expect } from 'vitest';
import {
	parseFeatureSelection,
	parsePlaceSelection,
	parsePlacePanelFlag,
	parseSortSelection,
	parseSearchQuery
} from './page-params';

function url(qs: string): URL {
	return new URL(`http://x/?${qs}`);
}

describe('parsePlaceSelection', () => {
	test('reads place and name ids', () => {
		const r = parsePlaceSelection(url('place=p1&name=n1'));
		expect(r).toEqual({ placeId: 'p1', nameId: 'n1' });
	});

	test('absent params are null', () => {
		expect(parsePlaceSelection(url(''))).toEqual({ placeId: null, nameId: null });
	});

	test('oversized ids are clamped, not rejected', () => {
		const r = parsePlaceSelection(url(`place=${'a'.repeat(600)}`));
		expect(r.placeId).toHaveLength(512);
	});
});

describe('parsePlacePanelFlag', () => {
	test("only '1' opens the panel", () => {
		expect(parsePlacePanelFlag(url('placePanel=1'))).toBe(true);
		expect(parsePlacePanelFlag(url('placePanel=true'))).toBe(false);
		expect(parsePlacePanelFlag(url('placePanel=0'))).toBe(false);
		expect(parsePlacePanelFlag(url(''))).toBe(false);
	});
});

describe('parseSortSelection', () => {
	test('valid modes pass through', () => {
		expect(parseSortSelection(url('sort=temporal')).sort).toBe('temporal');
	});

	test('unknown modes fall back to sample', () => {
		expect(parseSortSelection(url('sort=banana')).sort).toBe('sample');
	});

	test('seed is clamped to 64 chars', () => {
		const r = parseSortSelection(url(`sampleSeed=${'s'.repeat(100)}`));
		expect(r.sampleSeed).toHaveLength(64);
	});

	test('absent seed stays undefined', () => {
		expect(parseSortSelection(url('')).sampleSeed).toBeUndefined();
	});
});

describe('parseSearchQuery', () => {
	test('reads and trims the query', () => {
		expect(parseSearchQuery(url('q=%20zeedijk%20'))).toBe('zeedijk');
	});

	test('absent and blank collapse to null', () => {
		expect(parseSearchQuery(url(''))).toBeNull();
		expect(parseSearchQuery(url('q=%20%20'))).toBeNull();
	});

	test('oversized queries are clamped, not rejected', () => {
		expect(parseSearchQuery(url(`q=${'a'.repeat(600)}`))).toHaveLength(512);
	});
});

describe('parseFeatureSelection', () => {
	test('the feature and the place its card is at, each absent when not given', () => {
		expect(
			parseFeatureSelection(
				new URL(
					'http://x/?feature=22222222-2222-2222-2222-222222222201&at=https://adamlink.nl/geo/street/1'
				)
			)
		).toEqual({
			featureId: '22222222-2222-2222-2222-222222222201',
			placeId: 'https://adamlink.nl/geo/street/1'
		});
		expect(parseFeatureSelection(new URL('http://x/?feature=f'))).toEqual({
			featureId: 'f',
			placeId: null
		});
		expect(parseFeatureSelection(new URL('http://x/'))).toEqual({ featureId: null, placeId: null });
	});
});
