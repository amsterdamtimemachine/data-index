<script lang="ts">
	import FeaturesGrid from '$components/FeaturesGrid.svelte';
	import FeaturesPanelHeader from '$components/FeaturesPanelHeader.svelte';
	import ErrorHandler from '$components/ErrorHandler.svelte';
	import { type UiSortMode } from '$components/FeaturesSortSelect.svelte';
	import { createPanelFeatures, type PanelSubject } from '$lib/state/panel-features.svelte';
	import type { HeatmapTimeline, HeatmapDimensions } from '@atm/shared/types';
	import type { FilterState } from '$types/filters';

	interface Props {
		subject: PanelSubject;
		placeCells?: number[];
		period: string;
		// the applied filters, so the list agrees with the heatmap
		filters: FilterState;
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
		subject,
		placeCells = undefined,
		period,
		filters,
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

	const panelFeatures = createPanelFeatures(() => ({
		subject,
		period,
		filters,
		sortMode,
		sampleSeed
	}));

	function handleClose() {
		if (onClose) {
			onClose();
		}
	}
</script>

<ErrorHandler errorData={panelFeatures.errorData} />

<FeaturesPanelHeader
	{subject}
	{placeCells}
	{period}
	{selectionPeriod}
	{timeline}
	{dimensions}
	{gridColumns}
	{sortMode}
	{onSortChange}
	{onShuffle}
	searchActive={!!filters.searchQuery}
	totalCount={panelFeatures.totalCount}
	currentPage={panelFeatures.currentPage}
	pageSize={panelFeatures.pageSize}
	loading={panelFeatures.loading}
	initialLoading={panelFeatures.initialLoading}
	onPageChange={panelFeatures.changePage}
	onClose={handleClose}
/>

<div class="min-h-full bg-atm-sand-dark">
	{#if panelFeatures.features.length > 0}
		<FeaturesGrid features={panelFeatures.features} columns={gridColumns} />
	{:else if !panelFeatures.initialLoading && !panelFeatures.loading}
		<div class="text-base text-gray-500 p-4">No features found for this cell and period</div>
	{/if}
</div>
