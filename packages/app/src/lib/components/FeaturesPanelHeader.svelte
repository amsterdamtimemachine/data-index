<script lang="ts">
	import Pagination from '$components/Pagination.svelte';
	import FeaturesCount from '$components/FeaturesCount.svelte';
	import Button from '$components/Button.svelte';
	import X from 'phosphor-svelte/lib/X';
	import MapThumbnail from '$components/MapThumbnail.svelte';
	import FeaturesSortSelect, { type UiSortMode } from '$components/FeaturesSortSelect.svelte';
	import { createMediaQuery, MOBILE_QUERY } from '$utils/media.svelte';
	import type { HeatmapTimeline, HeatmapDimensions } from '@atm/shared/types';

	interface Props {
		cellId: string;
		period: string;
		selectionPeriod?: string;
		timeline?: HeatmapTimeline;
		dimensions?: HeatmapDimensions;
		gridColumns?: number;
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
		cellId,
		period,
		selectionPeriod,
		timeline,
		dimensions,
		gridColumns,
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

	// Desktop mirrors the live map; mobile freezes on the tap-time map (the panel
	// covers the real map there, and the local timeline must not move the minimap).
	const thumbnailPeriod = $derived.by(() => {
		if (isMobile.matches) {
			return selectionPeriod ?? period;
		}
		return period;
	});

	// 32px matches the header buttons; phones get the larger locator
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

<!-- Named grid areas — the close button owns the top-right cell, so no sibling
     appearing or growing can move it. The template follows the panel's column
     mode (data-layout), not the viewport. -->
<div
	data-layout={headerLayout}
	data-cols={gridColumns}
	class="panel-header sticky min-h-[50px] p-3 md:p-4 top-0 z-10 bg-atm-sand border-b border-atm-sand-border shadow-[0px_5px_20px_5px_rgba(0,0,0,0.07)]
	       grid items-center gap-x-3 gap-y-2"
>
	{#if timeline && dimensions}
		<div class="header-map">
			<MapThumbnail
				{timeline}
				{dimensions}
				{cellId}
				period={thumbnailPeriod}
				width={thumbnailWidth}
				height={thumbnailHeight}
			/>
		</div>
	{/if}
	{#if !initialLoading && totalCount > 0}
		<div class="header-count">
			<FeaturesCount totalFeatures={totalCount} {currentPage} featuresPerPage={pageSize} />
		</div>
		{#if hasPagination}
			<!-- Re-seed the builder (count/perPage are captured once) when the dataset changes -->
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
				<FeaturesSortSelect value={sortMode} onChange={onSortChange} {onShuffle} />
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

	/* Non-stacked layouts space cells with margins, not column-gap: an absent cell
	   then contributes no spacing, so gaps stay even whatever is rendered. */

	/* 2-col panel: desktop row; pagination gets its own full-width line */
	.panel-header[data-layout='split'] {
		grid-template-areas: 'map count sort close' 'pages pages pages pages';
		grid-template-columns: auto auto auto 1fr;
		column-gap: 0;
	}

	/* 3-col and wider: pagination joins the row, shrinkable so it wraps
	   internally when long */
	.panel-header[data-layout='inline'] {
		grid-template-areas: 'map count pages sort close';
		grid-template-columns: auto auto minmax(0, max-content) auto 1fr;
		column-gap: 0;
	}

	.panel-header[data-layout='split'] :is(.header-map, .header-count, .header-sort),
	.panel-header[data-layout='inline'] :is(.header-map, .header-count, .header-pages, .header-sort) {
		margin-right: 2rem;
	}
	/* at exactly 3 columns the full row only fits with tighter spacing */
	.panel-header[data-layout='inline'][data-cols='3'] :is(.header-map, .header-count, .header-pages, .header-sort) {
		margin-right: 1rem;
	}
</style>
