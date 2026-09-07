<script lang="ts">
	import Pagination from '$components/Pagination.svelte';
	import FeaturesCount from '$components/FeaturesCount.svelte';
	import Button from '$components/Button.svelte';
	import X from 'phosphor-svelte/lib/X';
	import MapThumbnail from '$components/MapThumbnail.svelte';
	import FeaturesSortSelect, { type UiSortMode } from '$components/FeaturesSortSelect.svelte';
	import { createMediaQuery, MOBILE_QUERY } from '$utils/media.svelte';
	import { translate } from '$utils/translations';
	import type { HeatmapTimeline, HeatmapDimensions } from '@atm/shared/types';
	import type { PanelSubject } from '$lib/state/panel-features.svelte';

	interface Props {
		subject: PanelSubject;
		// cells of the active place filter (shown in gold whatever the subject)
		placeCells?: number[];
		period: string;
		selectionPeriod?: string;
		timeline?: HeatmapTimeline;
		dimensions?: HeatmapDimensions;
		gridColumns?: number;
		sortMode: UiSortMode;
		onSortChange?: (mode: UiSortMode) => void;
		onShuffle?: () => void;
		searchActive?: boolean;
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
		gridColumns,
		sortMode,
		onSortChange,
		onShuffle,
		searchActive = false,
		totalCount,
		currentPage,
		pageSize,
		loading,
		initialLoading,
		onPageChange,
		onClose
	}: Props = $props();

	const hasPagination = $derived(totalCount > pageSize);

	const headerLayout = $derived.by(() => {
		if (gridColumns === undefined || gridColumns <= 1) {
			return 'stacked';
		}
		if (gridColumns === 2) {
			return 'split';
		}
		return 'inline';
	});

	const isMobile = createMediaQuery(MOBILE_QUERY);

	// minimap: a cell subject gets the red marker, a place subject its gold cells
	const thumbnailCellId = $derived.by(() => {
		if (subject.kind === 'cell') {
			return subject.cellId;
		}
		return undefined;
	});
	const highlightSelected = $derived(subject.kind === 'place');

	// the count names its population: this cell, or the place's cells — with the
	// clicked alias and, when it differs, the current name (the card convention)
	const populationLabel = $derived.by(() => {
		if (subject.kind === 'cell') {
			return translate('ofThisCell');
		}
		const place = subject.place;
		let shown = place.matchedName;
		if (!shown && place.name) {
			shown = place.name;
		}
		if (!shown) {
			shown = place.placeId;
		}
		let phrase = translate('ofCellsOf');
		if (place.cells.length === 1) {
			phrase = translate('ofCellOf');
		}
		let label = `${phrase} ${shown}`;
		if (place.name && place.name !== shown) {
			label = `${label} (${translate('nowKnownAs')} ${place.name})`;
		}
		return label;
	});

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

<div
	data-layout={headerLayout}
	class="panel-header sticky min-h-[50px] p-3 md:p-4 top-0 z-10 bg-atm-sand border-b border-atm-sand-border shadow-[0px_5px_20px_5px_rgba(0,0,0,0.07)]
	       grid items-center gap-x-3 gap-y-2"
>
	{#if timeline && dimensions}
		<div class="header-map">
			<MapThumbnail
				{timeline}
				{dimensions}
				cellId={thumbnailCellId}
				highlightCells={placeCells}
				{highlightSelected}
				period={thumbnailPeriod}
				width={thumbnailWidth}
				height={thumbnailHeight}
			/>
		</div>
	{/if}
	{#if !initialLoading && totalCount > 0}
		<div class="header-count">
			<FeaturesCount totalFeatures={totalCount} {currentPage} featuresPerPage={pageSize} {populationLabel} />
		</div>
		{#if hasPagination}
			<!-- pagination builder captures count/perPage once -->
			{#key `${totalCount}-${pageSize}`}
				<div class="header-pages min-w-0">
					<Pagination
						totalItems={totalCount}
						{currentPage}
						itemsPerPage={pageSize}
						{onPageChange}
						{loading}
					/>
				</div>
			{/key}
		{/if}
		{#if onSortChange && onShuffle}
			<div class="header-sort">
				<FeaturesSortSelect value={sortMode} onChange={onSortChange} {onShuffle} {searchActive} />
			</div>
		{/if}
	{/if}
	<div class="header-close justify-self-end">
		<Button icon={X} onclick={onClose} size={18} aria-label="Close features panel" />
	</div>
</div>

<style lang="postcss">
	.panel-header {
		grid-template-areas: 'map count close' 'pages pages .' 'sort sort .';
		grid-template-columns: auto 1fr auto;
	}
	.header-map {
		grid-area: map;
	}
	.header-count {
		grid-area: count;
	}
	.header-pages {
		grid-area: pages;
	}
	.header-sort {
		grid-area: sort;
	}
	.header-close {
		grid-area: close;
	}

	/* margins, not column-gap: an absent cell must not leave a gap */
	/* the count text is the squeezable track (it wraps); pagination stays rigid */
	.panel-header[data-layout='split'] {
		grid-template-areas: 'map count sort close' 'pages pages pages pages';
		grid-template-columns: auto minmax(0, max-content) auto 1fr;
		column-gap: 0;
	}

	.panel-header[data-layout='inline'] {
		grid-template-areas: 'map count pages sort close';
		grid-template-columns: auto minmax(0, max-content) max-content auto 1fr;
		column-gap: 0;
	}

	.panel-header[data-layout='split'] :is(.header-map, .header-count, .header-sort),
	.panel-header[data-layout='inline'] :is(.header-map, .header-count, .header-pages, .header-sort) {
		margin-right: 1rem;
	}
</style>
