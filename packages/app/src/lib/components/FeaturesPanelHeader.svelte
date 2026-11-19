<script lang="ts">
	import Pagination from '#lib/components/Pagination.svelte';
	import FeaturesCount from '#lib/components/FeaturesCount.svelte';
	import Button from '#lib/components/Button.svelte';
	import X from 'phosphor-svelte/lib/X';
	import MapThumbnail from '#lib/components/MapThumbnail.svelte';
	import FeaturesSortSelect from '#lib/components/FeaturesSortSelect.svelte';
	import type { UiSortMode } from '#lib/utils/sort-modes.js';
	import { createMediaQuery, MOBILE_QUERY } from '#lib/utils/media.svelte.js';
	import { translate } from '#lib/utils/translations.js';
	import { subjectPhrase } from '#lib/utils/format.js';
	import type { HeatmapTimeline, HeatmapDimensions } from '@atm/shared/types';
	import type { PanelSubject } from '#lib/state/panel-features.svelte.js';

	interface Props {
		subject: PanelSubject;
		// cells of the active place filter (shown in gold whatever the subject)
		placeCells?: number[];
		period: string;
		selectionPeriod?: string;
		timeline?: HeatmapTimeline;
		dimensions?: HeatmapDimensions;
		sortMode: UiSortMode;
		onSortChange?: (mode: UiSortMode) => void;
		onShuffle?: () => void;
		totalCount: number;
		currentPage: number;
		pageSize: number;
		loading: boolean;
		initialLoading: boolean;
		onPageChange: (page: number) => void;
		onClose: () => void;
	}

	let {
		subject,
		placeCells = undefined,
		period,
		selectionPeriod,
		timeline,
		dimensions,
		sortMode,
		onSortChange,
		onShuffle,
		totalCount,
		currentPage,
		pageSize,
		loading,
		initialLoading,
		onPageChange,
		onClose
	}: Props = $props();

	const hasPagination = $derived(totalCount > pageSize);

	const isMobile = createMediaQuery(MOBILE_QUERY);

	// minimap: a cell subject gets the red marker, a place subject its gold cells
	const thumbnailCellId = $derived.by(() => {
		if (subject.kind === 'cell') {
			return subject.cellId;
		}
		return undefined;
	});
	const highlightSelected = $derived(subject.kind === 'place');

	// the count names its population: this cell, or the place's cells
	const populationLabel = $derived(subjectPhrase(subject));

	// desktop: live period; mobile: frozen at cell selection
	const thumbnailPeriod = $derived.by(() => {
		if (isMobile.matches) {
			return selectionPeriod ?? period;
		}
		return period;
	});

	const thumbnailWidth = $derived.by(() => {
		if (isMobile.matches) {
			return 100;
		}
		return 64;
	});
	const thumbnailHeight = $derived.by(() => {
		if (isMobile.matches) {
			return 50;
		}
		return 32;
	});
</script>

<!--
	One layout at every width, with no breakpoints: the map and the count, then the
	pagination and the sort, on one line when it fits. When it does not, the controls move
	to a second line, and when that is too narrow for both, the sort wraps under the
	pagination. The close button keeps the top right corner, which the padding leaves free.
-->
<div
	class="sticky top-0 z-10 min-h-[50px] p-3 pr-[calc(0.75rem+32px+0.75rem)] md:p-4 md:pr-[calc(1rem+32px+0.75rem)]
	       bg-atm-sand border-b border-atm-sand-border shadow-panel
	       flex flex-wrap items-center gap-x-4 gap-y-2"
>
	<h2 class="sr-only">{translate('results')}</h2>
	<!-- the map and the count stay together; the count's text is what gives when it is narrow -->
	<div class="min-w-0 flex items-center gap-x-3">
		{#if timeline && dimensions}
			<MapThumbnail
				{timeline}
				{dimensions}
				cellId={thumbnailCellId}
				highlightCells={placeCells}
				{highlightSelected}
				period={thumbnailPeriod}
				width={thumbnailWidth}
				height={thumbnailHeight}
				class="shrink-0"
			/>
		{/if}
		{#if !initialLoading && totalCount > 0}
			<div class="min-w-0">
				<FeaturesCount count={totalCount} {currentPage} perPage={pageSize}>
					{#snippet children(shown)}
						{translate('showing')} {shown} {translate('featureMany')} {populationLabel}
					{/snippet}
				</FeaturesCount>
			</div>
		{/if}
	</div>
	{#if !initialLoading && totalCount > 0}
		<div class="min-w-0 max-w-full flex flex-wrap items-center gap-x-4 gap-y-2">
			{#if hasPagination}
				<Pagination
					totalItems={totalCount}
					{currentPage}
					itemsPerPage={pageSize}
					{onPageChange}
					{loading}
				/>
			{/if}
			{#if onSortChange && onShuffle}
				<FeaturesSortSelect value={sortMode} onChange={onSortChange} {onShuffle} />
			{/if}
		</div>
	{/if}
	<div class="absolute top-3 right-3 md:top-4 md:right-4">
		<Button icon={X} onclick={onClose} size={18} aria-label={translate('closeFeaturesPanel')} />
	</div>
</div>
