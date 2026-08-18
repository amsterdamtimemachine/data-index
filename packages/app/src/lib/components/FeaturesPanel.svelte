<script lang="ts">
	import { onMount } from 'svelte';
	import FeaturesGrid from '$components/FeaturesGrid.svelte';
	import Pagination from '$components/Pagination.svelte';
	import FeaturesCount from '$components/FeaturesCount.svelte';
	import Button from '$components/Button.svelte';
	import Tooltip from '$components/Tooltip.svelte';
	import X from 'phosphor-svelte/lib/X';
	import QuestionMark from 'phosphor-svelte/lib/QuestionMark';
	import MapThumbnail from '$components/MapThumbnail.svelte';
	import FeaturesSortSelect, { type UiSortMode } from '$components/FeaturesSortSelect.svelte';
	import type { FeatureResult, HeatmapTimeline, HeatmapDimensions } from '@atm/shared/types';
	import { loadingState } from '$lib/state/loadingState.svelte';
	import { createError, createPageErrorData } from '$utils/error';
	import ErrorHandler from '$components/ErrorHandler.svelte';
	import type { RecordType } from '@atm/shared/types';
	import type { AppError } from '$types/error';

	interface Props {
		cellId: string;
		period: string;
		bounds?: { minLat: number; maxLat: number; minLon: number; maxLon: number };
		recordTypes: RecordType[];
		placeTypes?: string[];
		datasets: string[];
		tags: string[];
		tagOperator?: 'AND' | 'OR';
		onClose?: () => void;
		// For the mobile minimap — flow down from the page's heatmap state.
		timeline?: HeatmapTimeline;
		dimensions?: HeatmapDimensions;
		// Desktop snap-resize: explicit column count; undefined keeps the grid responsive.
		gridColumns?: number;
		sortMode?: UiSortMode;
		// Explicit shuffle seed (URL-owned); absent → derived from cellId for a
		// stable per-cell order.
		sampleSeed?: string;
		onSortChange?: (mode: UiSortMode) => void;
		onShuffle?: () => void;
	}

	let { cellId, period, bounds, recordTypes, placeTypes = [], datasets, tags, tagOperator = 'OR', onClose, timeline, dimensions, gridColumns, sortMode = 'sample', sampleSeed, onSortChange, onShuffle }: Props = $props();

	function sortParams(): Record<string, string> {
		if (sortMode === 'spatial') {
			return { sort: 'spatialFrequency', sortDirection: 'desc' };
		}
		if (sortMode === 'oldest') {
			return { sort: 'date', sortDirection: 'asc' };
		}
		if (sortMode === 'newest') {
			return { sort: 'date', sortDirection: 'desc' };
		}
		let seed = cellId;
		if (sampleSeed) {
			seed = sampleSeed;
		}
		return { sort: 'sample', seed };
	}

	// Cell data state
	let allFeatures = $state<FeatureResult[]>([]);
	let currentPage = $state(1);
	let totalCount = $state(0);
	let pageSize = $state(100); // From API response

	const hasPagination = $derived(totalCount > pageSize);
	const countWrapClass = $derived.by(() => {
		if (hasPagination) {
			return 'basis-full md:basis-auto';
		}
		return '';
	});
	let loading = $state(false);
	let initialLoading = $state(true);
	let errors = $state<AppError[]>([]);
	let errorData = $derived(createPageErrorData(errors));

	async function loadCellData(page: number = 1) {
		loading = true;
		loadingState.startLoading();

		try {
			if (!bounds) {
				throw new Error('No bounds available for this cell');
			}

			// Parse period to get time slice key
			const timeSlice = period;

			// Build URL for local /api/features endpoint
			const params = new URLSearchParams({
				minLon: bounds.minLon.toString(),
				maxLon: bounds.maxLon.toString(),
				minLat: bounds.minLat.toString(),
				maxLat: bounds.maxLat.toString(),
				page: page.toString(),
				timeSlice,
				tagOperator,
				...sortParams()
			});

			if (recordTypes.length > 0) {
				params.set('recordTypes', recordTypes.join(','));
			}
			if (placeTypes.length > 0) {
				params.set('placeTypes', placeTypes.join(','));
			}
			if (datasets.length > 0) {
				params.set('datasets', datasets.join(','));
			}
			if (tags.length > 0) {
				params.set('tags', tags.join(','));
			}

			const response = await fetch(`/api/features?${params}`);
			if (!response.ok) {
				throw new Error(`HTTP ${response.status}`);
			}

			const data = await response.json();

			allFeatures = data.data || [];
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
					{ cellId, period, page, recordTypes, tags }
				)
			];
		} finally {
			loading = false;
			loadingState.stopLoading();
		}
	}

	function handlePageChange(newPage: number) {
		if (loading) return; // Prevent multiple concurrent requests
		loadCellData(newPage);
	}

	$effect(() => {
		// Reset state when cellId, period, or sorting changes (sortMode/sampleSeed are
		// read via sortParams() inside loadCellData, before its first await)
		allFeatures = [];
		currentPage = 1;
		totalCount = 0;
		pageSize = 100;
		errors = [];
		initialLoading = true;

		// Load new data
		loadCellData(1).finally(() => {
			initialLoading = false;
		});
	});

	function closeModal() {
		if (onClose) {
			onClose();
		}
	}
</script>

<ErrorHandler {errorData} />

<!-- Data Header -->
<div
	class="sticky min-h-[50px] p-3 top-0 z-10 bg-atm-sand border-b border-atm-sand-border flex items-center gap-3 shadow-[0px_5px_20px_5px_rgba(0,0,0,0.07)]"
>
	{#if timeline && dimensions}
		<div class="md:hidden shrink-0">
			<MapThumbnail {timeline} {dimensions} {cellId} width={100} height={50} />
		</div>
	{/if}
	<div class="flex flex-wrap items-center gap-y-2 gap-x-4 flex-1 min-w-0">
		{#if !initialLoading && totalCount > 0}
			<div class={countWrapClass}>
				<FeaturesCount totalFeatures={totalCount} {currentPage} featuresPerPage={pageSize} />
			</div>
			{#if hasPagination}
				<!-- Re-seed the builder (count/perPage are captured once) when the dataset changes -->
				{#key `${totalCount}-${pageSize}`}
					<Pagination
						totalItems={totalCount}
						{currentPage}
						itemsPerPage={pageSize}
						onPageChange={handlePageChange}
						{loading}
					/>
				{/key}
			{/if}
			{#if onSortChange && onShuffle}
				<FeaturesSortSelect value={sortMode} onChange={onSortChange} {onShuffle} />
			{/if}
		{/if}
	</div>
	<Button
		icon={X}
		onclick={closeModal}
		size={18}
		class="self-start md:self-center"
		aria-label="Close features panel"
	/>
</div>

<div class="min-h-full bg-atm-sand-dark">
	{#if allFeatures.length > 0}
		<FeaturesGrid features={allFeatures} columns={gridColumns} />
	{:else if !initialLoading && !loading}
		<div class="text-base text-gray-500 p-4">No features found for this cell and period</div>
	{/if}
</div>
