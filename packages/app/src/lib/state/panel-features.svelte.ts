/** Reactive fetcher for the features panel's population. */
import { loadingState } from '$lib/state/loadingState.svelte';
import { createError, createPageErrorData } from '$utils/error';
import { untrack } from 'svelte';
import type { FeatureResult, RecordType, PlaceSearchMatch } from '@atm/shared/types';
import type { UiSortMode } from '$components/FeaturesSortSelect.svelte';
import type { AppError } from '$types/error';

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
	recordTypes: RecordType[];
	placeTypes: string[];
	datasets: string[];
	tags: string[];
	tagOperator: 'AND' | 'OR';
	// text-search filter: the panel lists only matching features, so its counts
	// agree with a search-filtered heatmap
	searchQuery?: string;
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

function subjectContext(subject: PanelSubject): Record<string, string> {
	if (subject.kind === 'cell') {
		return { cellId: subject.cellId };
	}
	return { placeId: subject.place.placeId };
}

export function createPanelFeatures(getQuery: () => PanelFeaturesQuery) {
	let features = $state<FeatureResult[]>([]);
	let currentPage = $state(1);
	let totalCount = $state(0);
	let pageSize = $state(100);
	let loading = $state(false);
	let initialLoading = $state(true);
	let errors = $state<AppError[]>([]);
	const errorData = $derived(createPageErrorData(errors));

	async function loadPage(page: number = 1) {
		const query = getQuery();
		loading = true;
		loadingState.startLoading();

		try {
			const params = new URLSearchParams({
				...subjectParams(query.subject),
				page: page.toString(),
				timeSlice: query.period,
				tagOperator: query.tagOperator,
				...sortParams(query)
			});

			if (query.recordTypes.length > 0) {
				params.set('recordTypes', query.recordTypes.join(','));
			}
			if (query.placeTypes.length > 0) {
				params.set('placeTypes', query.placeTypes.join(','));
			}
			if (query.datasets.length > 0) {
				params.set('datasets', query.datasets.join(','));
			}
			if (query.tags.length > 0) {
				params.set('tags', query.tags.join(','));
			}
			if (query.searchQuery) {
				params.set('q', query.searchQuery);
			}

			const response = await fetch(`/api/features?${params}`);
			if (!response.ok) {
				throw new Error(`HTTP ${response.status}`);
			}

			const data = await response.json();

			features = data.data || [];
			currentPage = data.page || 1;
			totalCount = data.total || 0;
			pageSize = data.pageSize || 50;

			errors = [];
		} catch (err) {
			console.error('Error loading panel data:', err);
			errors = [
				createError(
					'error',
					'Panel Data Load Failed',
					err instanceof Error ? err.message : 'Failed to load panel data',
					{ ...subjectContext(getQuery().subject), period: getQuery().period, page }
				)
			];
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
		errors = [];
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
		get errorData() {
			return errorData;
		},
		changePage
	};
}
