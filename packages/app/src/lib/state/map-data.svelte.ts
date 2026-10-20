/**
 * The city-wide map data, fetched client-side so the page shell renders without
 * waiting on it: the heatmap timeline with its grid, and the histogram. Both refetch
 * when the filter params change. One URL definition feeds the <head> preloads and
 * the fetches, so the browser's preload always matches.
 */
import type { Histogram, HeatmapTimeline, HeatmapDimensions, HeatmapResponse } from '@atm/shared/types';
import { apiUrl } from '#lib/utils/api.js';
import { fetchJson } from '#lib/utils/fetchJson.js';
import { notifyFailure } from '#lib/state/notify.js';
import { loadingState } from '#lib/state/loadingState.svelte.js';

export type MapDataInputs = {
	params: URLSearchParams;
};

export function createMapData(inputs: MapDataInputs, onHeatmap?: () => void, onHistogram?: (histogram: Histogram) => void) {
	let timeline = $state<HeatmapTimeline | null>(null);
	let dimensions = $state<HeatmapDimensions | null>(null);
	let histogram = $state<Histogram | null>(null);

	const heatmapUrl = $derived(apiUrl('/api/heatmaps', inputs.params));
	const histogramUrl = $derived(apiUrl('/api/histogram', inputs.params));

	$effect(() => {
		const url = heatmapUrl;
		loadingState.startLoading();
		return fetchJson<HeatmapResponse>(
			url,
			(res) => {
				timeline = res.timeline;
				dimensions = res.dimensions;
				if (onHeatmap) {
					onHeatmap();
				}
			},
			(failure) => notifyFailure('mapNotLoaded', failure),
			() => loadingState.stopLoading()
		);
	});

	$effect(() => {
		const url = histogramUrl;
		return fetchJson<Histogram>(
			url,
			(res) => {
				histogram = res;
				if (onHistogram) {
					onHistogram(res);
				}
			},
			(failure) => notifyFailure('timelineNotLoaded', failure)
		);
	});

	return {
		get timeline() {
			return timeline;
		},
		get dimensions() {
			return dimensions;
		},
		get histogram() {
			return histogram;
		},
		get heatmapUrl() {
			return heatmapUrl;
		},
		get histogramUrl() {
			return histogramUrl;
		}
	};
}
