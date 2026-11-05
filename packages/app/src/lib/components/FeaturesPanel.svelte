<script lang="ts">
	import type { Category } from '#lib/utils/filters.js';
	import { translate } from '#lib/utils/translations.js';
	import { asset } from '$app/paths';
	import FeaturesGrid from '#lib/components/FeaturesGrid.svelte';
	import Image from '#lib/components/Image.svelte';
	import ButtonIllustration from '#lib/components/ButtonIllustration.svelte';
	import TextWithSlots from '#lib/components/TextWithSlots.svelte';
	import FeaturesPanelHeader from '#lib/components/FeaturesPanelHeader.svelte';
	import { type UiSortMode } from '#lib/components/FeaturesSortSelect.svelte';
	import { createPanelFeatures, type PanelSubject } from '#lib/state/panel-features.svelte.js';
	import type { HeatmapTimeline, HeatmapDimensions } from '@atm/shared/types';
	import type { FilterState } from '#lib/types/filters.js';

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
		// what the timeline shows, when an empty panel can point the user at it: the
		// city-wide series with the switch (desktop), or the selection's own series
		timelineView?: 'cityWide' | 'local';
		// the filter categories with nothing selected: there is nothing to list, and the panel says so
		emptyCategories?: Category[];
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
		onShuffle,
		timelineView = undefined,
		emptyCategories = []
	}: Props = $props();

	const panelFeatures = createPanelFeatures(() => ({
		subject,
		period,
		filters,
		sortMode,
		sampleSeed,
		idle: emptyCategories.length > 0
	}));

	const emptyCategoryNames = $derived(emptyCategories.map((c) => translate(`${c}Category`)).join(` ${translate('and')} `));

	function handleClose() {
		if (onClose) {
			onClose();
		}
	}
</script>


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
	{#if emptyCategories.length > 0}
		<p class="text-base text-black p-4 leading-loose">{translate('noneSelected').replace('{filter}', emptyCategoryNames)}</p>
	{:else if panelFeatures.features.length > 0}
		<FeaturesGrid features={panelFeatures.features} columns={gridColumns} />
	{:else if !panelFeatures.initialLoading && !panelFeatures.loading}
		<p class="text-base text-black p-4 leading-loose">
			<span class="font-bold">{translate('noFeaturesForSelection')}</span>
			{#if timelineView === 'cityWide'}
				<TextWithSlots text={translate('emptyPanelCityWideHint')}>
					{#snippet children(slot)}
						{#if slot === 'button'}
							<ButtonIllustration glyph="glyphs/ToggleLocalTimeline.svg" />
						{/if}
					{/snippet}
				</TextWithSlots>
			{:else if timelineView === 'local'}
				<TextWithSlots text={translate('emptyPanelBarHint')}>
					{#snippet children(slot)}
						{#if slot === 'picture'}
							<Image src={asset('images/local-timeline-detail.png')} alt={translate('localTimelineAlt')} inline />
						{/if}
					{/snippet}
				</TextWithSlots>
			{/if}
			{#if timelineView}
				{translate('emptyPanelOtherCell')}
			{/if}
		</p>
	{/if}
</div>
