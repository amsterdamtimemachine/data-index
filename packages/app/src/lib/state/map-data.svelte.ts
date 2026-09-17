/**
 * The city-wide map data, fetched client-side so the page shell renders without
 * waiting on it: the heatmap timeline with its grid, and the histogram. Both refetch
 * when the filter params change. One URL definition feeds the <head> preloads and
 * the fetches, so the browser's preload always matches.
 */
import { untrack } from 'svelte';
import type { Histogram, HeatmapTimeline, HeatmapDimensions, HeatmapResponse, RecordType } from '@atm/shared/types';
import type { AppError } from '$types/error';
import { apiUrl } from '$utils/api';
import { fetchJson } from '$utils/fetchJson';
import { createError } from '$utils/error';
import { loadingState } from '$lib/state/loadingState.svelte';

export type MapDataInputs = {
	params: URLSearchParams;
	// context for the load errors
	recordTypes: RecordType[];
};

export function createMapData(inputs: MapDataInputs, onHeatmap?: () => void) {
	let timeline = $state<HeatmapTimeline | null>(null);
	let dimensions = $state<HeatmapDimensions | null>(null);
	let histogram = $state<Histogram | null>(null);
	let errors = $state<AppError[]>([]);

	const heatmapUrl = $derived(apiUrl('/api/heatmaps', inputs.params));
	const histogramUrl = $derived(apiUrl('/api/histogram', inputs.params));

	function loadError(title: string, message: string) {
		errors = [...errors, createError('warning', title, message, { recordTypes: untrack(() => inputs.recordTypes) })];
	}

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
			() => loadError('Heatmap Load Error', 'Could not load heatmap. Spatial visualization may be limited.'),
			() => loadingState.stopLoading()
		);
	});

	$effect(() => {
		const url = histogramUrl;
		return fetchJson<Histogram>(
			url,
			(res) => {
				histogram = res;
			},
			() => loadError('Histogram Load Error', 'Could not load histogram. Temporal data may be limited.')
		);
	});

	function clearErrors() {
		errors = [];
	}

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
		},
		get errors() {
			return errors;
		},
		clearErrors
	};
}
