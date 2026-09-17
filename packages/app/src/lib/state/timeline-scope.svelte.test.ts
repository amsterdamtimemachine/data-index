/**
 * The timeline scope: which series the band shows and when. Desktop needs the
 * switch, mobile follows the open modal or panel; the place wins over the cell;
 * a loading subject shows the empty band; losing the last subject resets the
 * switch; a stale request cannot clear the loading state. A fake fetcher stands
 * in for the network and hands back the request callbacks.
 */
import { describe, test, expect, afterEach, vi } from 'vitest';
import { flushSync } from 'svelte';

// the scope builds its request URLs with the app's base path, which only SvelteKit provides
vi.mock('$app/paths', () => ({ base: '' }));

import type { Histogram, HeatmapCellBounds } from '@atm/shared/types';
import { createTimelineScope, type TimelineScopeInputs, type Fetcher } from './timeline-scope.svelte';

function series(count: number): Histogram {
	return {
		bins: [{
			timeSlice: { key: '1900_1950', label: '1900-1950', timeRange: { start: '1900', end: '1950' }, startYear: 1900, endYear: 1950, durationYears: 50 },
			count
		}],
		maxCount: count,
		timeRange: { start: '1900', end: '1950' },
		totalFeatures: count
	};
}

const CELL: HeatmapCellBounds = { minLon: 4.9, maxLon: 4.91, minLat: 52.37, maxLat: 52.38 };

type Request = { url: string; loaded: (h: Histogram) => void; settled: () => void };

let cleanups: Array<() => void> = [];
afterEach(() => {
	for (const cleanup of cleanups) {
		cleanup();
	}
	cleanups = [];
});

function harness(overrides: Partial<TimelineScopeInputs> = {}) {
	const inputs = $state<TimelineScopeInputs>({
		isMobile: false,
		cellModalOpen: false,
		placePanelOpen: false,
		placeTitle: null,
		cellBounds: null,
		placeId: null,
		params: '',
		...overrides
	});
	const requests: Request[] = [];
	const fetcher = ((url, onData, _onError, onSettled) => {
		requests.push({
			url,
			loaded: onData as (h: Histogram) => void,
			settled: () => {
				if (onSettled) onSettled();
			}
		});
		return () => {};
	}) as Fetcher;
	let scope!: ReturnType<typeof createTimelineScope>;
	cleanups.push($effect.root(() => {
		scope = createTimelineScope(inputs, fetcher);
	}));
	flushSync();
	return { inputs, requests, scope };
}

function last(requests: Request[]): Request {
	return requests[requests.length - 1];
}

describe('timeline scope', () => {
	test('without a subject the band is city-wide, nothing is fetched and the switch has nothing to show', () => {
		const { scope, requests } = harness();
		expect(scope.histogram).toBeNull();
		expect(scope.available).toBe(false);
		expect(scope.subjectSeries).toBeNull();
		expect(scope.onToggle).toBeDefined();
		expect(requests).toEqual([]);
	});

	test('desktop: a loaded cell series waits for the switch, but is there for the markers', () => {
		const { inputs, scope, requests } = harness();
		inputs.cellBounds = CELL;
		flushSync();
		expect(requests.length).toBe(1);
		expect(last(requests).url).toContain('minLon=4.9');
		last(requests).loaded(series(3));
		last(requests).settled();
		flushSync();
		expect(scope.histogram).toBeNull();
		expect(scope.subjectSeries?.totalFeatures).toBe(3);
		expect(scope.available).toBe(true);
		scope.onToggle!();
		flushSync();
		expect(scope.switchOn).toBe(true);
		expect(scope.histogram?.totalFeatures).toBe(3);
		scope.onToggle!();
		flushSync();
		expect(scope.histogram).toBeNull();
	});

	test('while the subject loads, the switched-on band is empty rather than city-wide', () => {
		const { inputs, scope, requests } = harness();
		scope.onToggle!();
		inputs.cellBounds = CELL;
		flushSync();
		expect(scope.available).toBe(true);
		expect(scope.histogram?.bins).toEqual([]);
		last(requests).loaded(series(2));
		last(requests).settled();
		flushSync();
		expect(scope.histogram?.totalFeatures).toBe(2);
	});

	test('an open place panel shows the place series and names it', () => {
		const { inputs, scope, requests } = harness({ cellBounds: CELL });
		last(requests).loaded(series(1));
		last(requests).settled();
		inputs.placePanelOpen = true;
		inputs.placeTitle = 'Dam';
		inputs.placeId = 'p1';
		flushSync();
		expect(last(requests).url).toContain('placeId=p1');
		last(requests).loaded(series(5));
		last(requests).settled();
		scope.onToggle!();
		flushSync();
		expect(scope.histogram?.totalFeatures).toBe(5);
		expect(scope.label).toBe('Tijdlijn van Dam');
	});

	test('the filter params ride along and a change refetches', () => {
		const { inputs, requests } = harness({ cellBounds: CELL, params: 'recordTypes=image' });
		expect(last(requests).url).toContain('recordTypes=image');
		inputs.params = 'recordTypes=text';
		flushSync();
		expect(requests.length).toBe(2);
		expect(last(requests).url).toContain('recordTypes=text');
	});

	test('losing the last subject turns the switch off', () => {
		const { inputs, scope, requests } = harness({ cellBounds: CELL });
		last(requests).loaded(series(1));
		last(requests).settled();
		scope.onToggle!();
		flushSync();
		expect(scope.switchOn).toBe(true);
		inputs.cellBounds = null;
		flushSync();
		expect(scope.switchOn).toBe(false);
		expect(scope.available).toBe(false);
	});

	test('mobile: the open modal decides, and there is no switch', () => {
		const { inputs, scope, requests } = harness({ isMobile: true, cellBounds: CELL });
		expect(scope.onToggle).toBeUndefined();
		last(requests).loaded(series(4));
		last(requests).settled();
		flushSync();
		expect(scope.histogram).toBeNull();
		inputs.cellModalOpen = true;
		flushSync();
		expect(scope.histogram?.totalFeatures).toBe(4);
	});

	test('a stale request settling after its successor does not end the loading state', () => {
		const { inputs, scope, requests } = harness();
		scope.onToggle!();
		inputs.cellBounds = CELL;
		flushSync();
		const first = last(requests);
		inputs.cellBounds = { ...CELL, minLon: 4.92 };
		flushSync();
		const second = last(requests);
		first.settled();
		flushSync();
		expect(scope.available).toBe(true);
		expect(scope.histogram?.bins).toEqual([]);
		second.loaded(series(1));
		second.settled();
		flushSync();
		expect(scope.histogram?.totalFeatures).toBe(1);
	});
});
