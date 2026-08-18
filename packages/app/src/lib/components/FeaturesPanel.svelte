<script lang="ts">
	import FeaturesGrid from '$components/FeaturesGrid.svelte';
	import FeaturesPanelHeader from '$components/FeaturesPanelHeader.svelte';
	import ErrorHandler from '$components/ErrorHandler.svelte';
	import { type UiSortMode } from '$components/FeaturesSortSelect.svelte';
	import { createCellFeatures } from '$lib/state/cell-features.svelte';
	import type { HeatmapTimeline, HeatmapDimensions, RecordType } from '@atm/shared/types';

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
		timeline?: HeatmapTimeline;
		dimensions?: HeatmapDimensions;
		selectionPeriod?: string;
		gridColumns?: number;
		sortMode?: UiSortMode;
		sampleSeed?: string;
		onSortChange?: (mode: UiSortMode) => void;
		onShuffle?: () => void;
	}

	let {
		cellId,
		period,
		bounds,
		recordTypes,
		placeTypes = [],
		datasets,
		tags,
		tagOperator = 'OR',
		onClose,
		timeline,
		dimensions,
		selectionPeriod,
		gridColumns,
		sortMode = 'sample',
		sampleSeed,
		onSortChange,
		onShuffle
	}: Props = $props();

	const cellFeatures = createCellFeatures(() => ({
		cellId,
		period,
		bounds,
		recordTypes,
		placeTypes,
		datasets,
		tags,
		tagOperator,
		sortMode,
		sampleSeed
	}));

	function handleClose() {
		if (onClose) {
			onClose();
		}
	}
</script>

<ErrorHandler errorData={cellFeatures.errorData} />

<FeaturesPanelHeader
	{cellId}
	{period}
	{selectionPeriod}
	{timeline}
	{dimensions}
	{gridColumns}
	{sortMode}
	{onSortChange}
	{onShuffle}
	totalCount={cellFeatures.totalCount}
	currentPage={cellFeatures.currentPage}
	pageSize={cellFeatures.pageSize}
	loading={cellFeatures.loading}
	initialLoading={cellFeatures.initialLoading}
	onPageChange={cellFeatures.changePage}
	onClose={handleClose}
/>

<div class="min-h-full bg-atm-sand-dark">
	{#if cellFeatures.features.length > 0}
		<FeaturesGrid features={cellFeatures.features} columns={gridColumns} />
	{:else if !cellFeatures.initialLoading && !cellFeatures.loading}
		<div class="text-base text-gray-500 p-4">No features found for this cell and period</div>
	{/if}
</div>
