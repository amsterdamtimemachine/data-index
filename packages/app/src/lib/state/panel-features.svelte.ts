/** Reactive fetcher for the features panel's population. */
import { loadingState } from '#lib/state/loadingState.svelte.js';
import { untrack } from 'svelte';
import type { FeatureResult, PlaceSearchMatch } from '@atm/shared/types';
import type { FilterState } from '#lib/types/filters.js';
import { filterParams } from '#lib/utils/filters.js';
import type { UiSortMode } from '#lib/components/FeaturesSortSelect.svelte';
import { apiUrl } from '#lib/utils/api.js';
import { notifyFailure } from '#lib/state/notify.js';
import { announcer } from '#lib/a11y/announcer.svelte.js';
import { resultsSentence } from '#lib/a11y/announcements.js';
import { subjectPhrase } from '#lib/utils/format.js';

/**
 * What the panel is showing: one display cell (picked on the map) or a place's
 * cell set (picked via search).
 */
export type PanelSubject =
	| {
			kind: 'cell';
			cellId: string;
			bounds?: { minLat: number; maxLat: number; minLon: number; maxLon: number };
	  }
	| { kind: 'place'; place: PlaceSearchMatch };

export type PanelFeaturesQuery = {
	subject: PanelSubject;
	period: string;
	// the applied filters (search term included), so the list agrees with the heatmap
	filters: FilterState;
	sortMode: UiSortMode;
	sampleSeed?: string;
};

function sortParams(query: PanelFeaturesQuery): Record<string, string> {
	if (query.sortMode === 'spatial') {
		return { sort: 'spatialFrequency', sortDirection: 'desc' };
	}
	if (query.sortMode === 'temporal') {
		return { sort: 'datePrecision', sortDirection: 'desc' };
	}
	if (query.sortMode === 'relevance') {
		return { sort: 'relevance', sortDirection: 'desc' };
	}
	if (query.sortMode === 'bestMatch') {
		return { sort: 'bestMatch', sortDirection: 'desc' };
	}
	if (query.sortMode === 'oldest') {
		return { sort: 'date', sortDirection: 'asc' };
	}
	if (query.sortMode === 'newest') {
		return { sort: 'date', sortDirection: 'desc' };
	}
	// sample: the subject's id keeps the shuffle stable per cell / per place
	let seed: string;
	if (query.subject.kind === 'cell') {
		seed = query.subject.cellId;
	} else {
		seed = query.subject.place.placeId;
	}
	if (query.sampleSeed) {
		seed = query.sampleSeed;
	}
	return { sort: 'sample', seed };
}

function subjectParams(subject: PanelSubject): Record<string, string> {
	if (subject.kind === 'place') {
		return { placeId: subject.place.placeId };
	}
	if (!subject.bounds) {
		throw new Error('No bounds available for this cell');
	}
	return {
		minLon: subject.bounds.minLon.toString(),
		maxLon: subject.bounds.maxLon.toString(),
		minLat: subject.bounds.minLat.toString(),
		maxLat: subject.bounds.maxLat.toString()
	};
}

export function createPanelFeatures(getQuery: () => PanelFeaturesQuery) {
	let features = $state<FeatureResult[]>([]);
	let currentPage = $state(1);
	let totalCount = $state(0);
	let pageSize = $state(100);
	let loading = $state(false);
	let initialLoading = $state(true);

	async function loadPage(page: number = 1) {
		const query = getQuery();
		loading = true;
		loadingState.startLoading();

		try {
			const params = new URLSearchParams({
				...subjectParams(query.subject),
				page: page.toString(),
				timeSlice: query.period,
				...sortParams(query)
			});
			for (const [name, value] of filterParams(query.filters)) {
				params.set(name, value);
			}

			const response = await fetch(apiUrl('/api/features', params));
			if (!response.ok) {
				throw response;
			}

			const data = await response.json();

			features = data.data || [];
			currentPage = data.page || 1;
			totalCount = data.total || 0;
			pageSize = data.pageSize || 50;
			announcer.announce(resultsSentence(totalCount, currentPage, pageSize, subjectPhrase(query.subject)));
		} catch (err) {
			notifyFailure('featuresNotLoaded', err);
		} finally {
			loading = false;
			loadingState.stopLoading();
		}
	}

	function changePage(page: number) {
		if (loading) {
			return;
		}
		void loadPage(page);
	}

	$effect(() => {
		// the getter's reads register the reload triggers
		getQuery();
		features = [];
		currentPage = 1;
		totalCount = 0;
		pageSize = 100;
		initialLoading = true;

		untrack(() => {
			void loadPage(1).finally(() => {
				initialLoading = false;
			});
		});
	});

	return {
		get features() {
			return features;
		},
		get currentPage() {
			return currentPage;
		},
		get totalCount() {
			return totalCount;
		},
		get pageSize() {
			return pageSize;
		},
		get loading() {
			return loading;
		},
		get initialLoading() {
			return initialLoading;
		},
		changePage
	};
}
