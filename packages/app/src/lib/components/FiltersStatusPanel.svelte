<script lang="ts">
	import { mergeCss } from '$utils/utils';
	import { translate, translateAll } from '$utils/translations';
	import { selectsAll } from '$utils/filters';
	import { formatPlaceName } from '$utils/format';
	import Tag from './Tag.svelte';
	import type { PlaceSearchMatch, VisualizationMetadata } from '@atm/shared/types';
	import type { FilterState } from '$types/filters';

	interface Props {
		// the applied filters (a paused search term already left out)
		filters: FilterState;
		metadata: VisualizationMetadata | null;
		selectedPlace?: PlaceSearchMatch | null;
		class?: string;
	}

	let { filters, metadata, selectedPlace = null, class: className }: Props = $props();

	const allRecordTypes = $derived(metadata?.recordTypes ?? []);
	const allPlaceTypes = $derived(metadata?.placeTypes ?? []);
	const allDatasets = $derived(metadata?.datasets ?? []);

	// a category that selects everything reads as everything, not as a list of picks
	const displayedRecordTypes = $derived.by(() => {
		if (selectsAll(filters.recordTypes, allRecordTypes)) {
			return translateAll(allRecordTypes);
		}
		return translateAll(filters.recordTypes);
	});
	const displayedPlaceTypes = $derived.by(() => {
		if (selectsAll(filters.placeTypes, allPlaceTypes)) {
			return translateAll(allPlaceTypes);
		}
		return translateAll(filters.placeTypes);
	});
	const displayedDatasets = $derived.by(() => {
		const label = new Map(allDatasets.map((d) => [d.id, d.label]));
		let ids = filters.datasets;
		if (selectsAll(filters.datasets, allDatasets.map((d) => d.id))) {
			ids = allDatasets.map((d) => d.id);
		}
		return ids.map((id) => label.get(id) || id);
	});
	const searchQuery = $derived(filters.searchQuery);
	const selectedTags = $derived(filters.tags);
	const tagOperator = $derived(filters.tagOperator);
</script>

<div
	class={mergeCss('bg-atm-sand border border-atm-sand-border rounded-sm shadow-sm p-1', className)}
>
	<div class="text-base font-sans text-black flex flex-wrap items-center gap-1">
		<span>Bekijk</span>
		{#each displayedRecordTypes as recordType, index}
			<Tag variant="selected-outline">{recordType}</Tag>
			{#if index < displayedRecordTypes.length - 1}
				<span>of</span>
			{/if}
		{/each}
		{#if displayedPlaceTypes.length > 0}
			<span>op</span>
			{#each displayedPlaceTypes as placeType, index}
				<Tag variant="selected-outline">{placeType}</Tag>
				{#if index < displayedPlaceTypes.length - 1}
					<span>of</span>
				{/if}
			{/each}
		{/if}
		<span>in</span>
		{#each displayedDatasets as dataset, index}
			<Tag variant="selected-outline">{dataset}</Tag>
			{#if index < displayedDatasets.length - 1}
				<span>en</span>
			{/if}
		{/each}
		{#if selectedPlace}
			<span>bij</span>
			<Tag variant="selected-outline">{formatPlaceName(selectedPlace)}</Tag>
		{/if}
		{#if searchQuery}
			<span>met</span>
			<Tag variant="selected-outline">{searchQuery}</Tag>
		{/if}
		{#if selectedTags.length > 0}
			<span>over</span>
			{#each selectedTags as tag, index}
				<Tag variant="selected-outline">{translate(tag)}</Tag>
				{#if index < selectedTags.length - 1}
					<span>{tagOperator === 'AND' ? 'en' : 'of'}</span>
				{/if}
			{/each}
		{/if}
	</div>
</div>
