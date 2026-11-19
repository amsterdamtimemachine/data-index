/**
 * The city-wide fetches: one URL per params for the heatmap and the histogram, the
 * first heatmap runs the page's setup, a failure is reported with the feature's key,
 * and a params change refetches.
 */
import { describe, test, expect, afterEach, vi } from 'vitest';
import { flushSync } from 'svelte';
import type { Histogram, HeatmapResponse } from '@atm/shared/types';

type Call = { url: string; load: (data: unknown) => void; fail: (failure: unknown) => void };
const calls: Call[] = [];
const failures: Array<[string, unknown]> = [];

vi.mock('#lib/state/notify.js', () => ({
	notifyFailure: (key: string, failure: unknown) => failures.push([key, failure])
}));

vi.mock('#lib/utils/fetchJson.js', () => ({
	fetchJson: (url: string, onData: (d: unknown) => void, onError: (failure: unknown) => void, onSettled?: () => void) => {
		calls.push({
			url,
			load: (data) => {
				onData(data);
				if (onSettled) onSettled();
			},
			fail: (failure) => {
				onError(failure);
				if (onSettled) onSettled();
			}
		});
		return () => {};
	}
}));

import { createMapData } from './map-data.svelte';

let cleanups: Array<() => void> = [];
afterEach(() => {
	for (const cleanup of cleanups) {
		cleanup();
	}
	cleanups = [];
	calls.length = 0;
	failures.length = 0;
});

function harness(query = 'recordTypes=image') {
	const inputs = $state({ params: new URLSearchParams(query) });
	let setups = 0;
	let data!: ReturnType<typeof createMapData>;
	cleanups.push($effect.root(() => {
		data = createMapData(inputs, () => {
			setups += 1;
		});
	}));
	flushSync();
	return { inputs, data, setups: () => setups };
}

const RESPONSE: HeatmapResponse = {
	timeline: { '1900_1950': { indices: [1], counts: [2] } },
	dimensions: { colsAmount: 2, rowsAmount: 1, minLon: 4, maxLon: 5, minLat: 52, maxLat: 53 }
} as unknown as HeatmapResponse;

describe('map data', () => {
	test('fetches the heatmap and the histogram for the params, and the URLs feed the preloads', () => {
		const { data } = harness();
		expect(calls.map((c) => c.url)).toEqual(['/api/heatmaps?recordTypes=image', '/api/histogram?recordTypes=image']);
		expect(data.heatmapUrl).toBe('/api/heatmaps?recordTypes=image');
		expect(data.histogramUrl).toBe('/api/histogram?recordTypes=image');
	});

	test('a loaded heatmap sets the timeline and grid and runs the setup callback', () => {
		const { data, setups } = harness();
		calls[0].load(RESPONSE);
		flushSync();
		expect(data.timeline).toEqual(RESPONSE.timeline);
		expect(data.dimensions).toEqual(RESPONSE.dimensions);
		expect(setups()).toBe(1);
		calls[1].load({ bins: [], maxCount: 0, timeRange: { start: '', end: '' }, totalFeatures: 7 } satisfies Histogram);
		flushSync();
		expect(data.histogram?.totalFeatures).toBe(7);
	});

	test('a failed fetch is reported with the feature it was for', () => {
		harness();
		const lost = new TypeError('Failed to fetch');
		calls[0].fail(lost);
		calls[1].fail(lost);
		flushSync();
		expect(failures).toEqual([
			['mapNotLoaded', lost],
			['timelineNotLoaded', lost]
		]);
	});

	test('a params change refetches both', () => {
		const { inputs } = harness();
		inputs.params = new URLSearchParams('recordTypes=text');
		flushSync();
		expect(calls.slice(2).map((c) => c.url)).toEqual(['/api/heatmaps?recordTypes=text', '/api/histogram?recordTypes=text']);
	});
});
