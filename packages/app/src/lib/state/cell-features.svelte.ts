/** Reactive fetcher for one cell's feature list. */
import { loadingState } from '$lib/state/loadingState.svelte';
import { createError, createPageErrorData } from '$utils/error';
import { untrack } from 'svelte';
import type { FeatureResult, RecordType } from '@atm/shared/types';
import type { UiSortMode } from '$components/FeaturesSortSelect.svelte';
import type { AppError } from '$types/error';

export type CellFeaturesQuery = {
	cellId: string;
	period: string;
	bounds?: { minLat: number; maxLat: number; minLon: number; maxLon: number };
	recordTypes: RecordType[];
	placeTypes: string[];
	datasets: string[];
	tags: string[];
	tagOperator: 'AND' | 'OR';
	sortMode: UiSortMode;
	sampleSeed?: string;
};

function sortParams(query: CellFeaturesQuery): Record<string, string> {
	if (query.sortMode === 'spatial') {
		return { sort: 'spatialFrequency', sortDirection: 'desc' };
	}
	if (query.sortMode === 'temporal') {
		return { sort: 'datePrecision', sortDirection: 'desc' };
	}
	if (query.sortMode === 'relevance') {
		return { sort: 'relevance', sortDirection: 'desc' };
	}
	if (query.sortMode === 'oldest') {
		return { sort: 'date', sortDirection: 'asc' };
	}
	if (query.sortMode === 'newest') {
		return { sort: 'date', sortDirection: 'desc' };
	}
	let seed = query.cellId;
	if (query.sampleSeed) {
		seed = query.sampleSeed;
	}
	return { sort: 'sample', seed };
}

export function createCellFeatures(getQuery: () => CellFeaturesQuery) {
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
			if (!query.bounds) {
				throw new Error('No bounds available for this cell');
			}

			const params = new URLSearchParams({
				minLon: query.bounds.minLon.toString(),
				maxLon: query.bounds.maxLon.toString(),
				minLat: query.bounds.minLat.toString(),
				maxLat: query.bounds.maxLat.toString(),
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
			console.error('Error loading cell data:', err);
			errors = [
				createError(
					'error',
					'Cell Data Load Failed',
					err instanceof Error ? err.message : 'Failed to load cell data',
					{ cellId: query.cellId, period: query.period, page, recordTypes: query.recordTypes, tags: query.tags }
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
