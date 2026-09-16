<script lang="ts">
	import { translate } from '$utils/translations';
	import { asset } from '$app/paths';
	import FeaturesGrid from '$components/FeaturesGrid.svelte';
	import Image from '$components/Image.svelte';
	import ButtonIllustration from '$components/ButtonIllustration.svelte';
	import FeaturesPanelHeader from '$components/FeaturesPanelHeader.svelte';
	import ErrorHandler from '$components/ErrorHandler.svelte';
	import { type UiSortMode } from '$components/FeaturesSortSelect.svelte';
	import { createPanelFeatures, type PanelSubject } from '$lib/state/panel-features.svelte';
	import type { HeatmapTimeline, HeatmapDimensions, RecordType } from '@atm/shared/types';

	interface Props {
		subject: PanelSubject;
		placeCells?: number[];
		period: string;
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
		// what the timeline shows, when an empty panel can point the user at it: the
		// city-wide series with the switch (desktop), or the selection's own series
		timelineView?: 'cityWide' | 'local';
	}

	let {
		subject,
		placeCells = undefined,
		period,
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
		onShuffle,
		timelineView = undefined
	}: Props = $props();

	const panelFeatures = createPanelFeatures(() => ({
		subject,
		period,
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
		<p class="text-base text-black p-4 leading-loose">
			<span class="font-bold">{translate('noFeaturesForSelection')}</span>
			{#if timelineView === 'cityWide'}
				{translate('emptyPanelDotHintLead')}
				<Image src={asset('/images/red-dot-timeline-detail.png')} alt={translate('redDotTimelineAlt')} inline />
				{translate('emptyPanelDotHintTail')}
				{translate('emptyPanelSwitchHintLead')}
				<ButtonIllustration glyph="/glyphs/ToggleLocalTimeline.svg" />
				{translate('emptyPanelSwitchHintTail')}
			{:else if timelineView === 'local'}
				{translate('emptyPanelBarHintLead')}
				<Image src={asset('/images/local-timeline-detail.png')} alt={translate('localTimelineAlt')} inline />
				{translate('emptyPanelBarHintTail')}
			{/if}
		</p>
	{/if}
</div>
