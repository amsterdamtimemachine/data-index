<script lang="ts">
	import { mergeCss } from '#lib/utils/utils.js';
	import { translate, translateAll } from '#lib/utils/translations.js';
	import { selectsAll } from '#lib/utils/filters.js';
	import { formatPlaceTitle } from '#lib/utils/format.js';
	import Tag from './Tag.svelte';
	import MapPin from 'phosphor-svelte/lib/MapPin';
	import MagnifyingGlass from 'phosphor-svelte/lib/MagnifyingGlass';
	import type { FiltersStatus } from '#lib/types/filters.js';

	interface Props {
		// everything the line describes, with a paused search term already left out
		status: FiltersStatus;
		class?: string;
	}

	let { status, class: className }: Props = $props();

	const filters = $derived(status.filters);
	const selectedPlace = $derived(status.place);
	const allRecordTypes = $derived(status.metadata?.recordTypes ?? []);
	const allPlaceTypes = $derived(status.metadata?.placeTypes ?? []);
	const allDatasets = $derived(status.metadata?.datasets ?? []);

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
	const tagJoiner = $derived.by(() => {
		if (tagOperator === 'AND') {
			return translate('and');
		}
		return translate('or');
	});
</script>

<div
	class={mergeCss('bg-atm-sand border border-atm-sand-border rounded-sm shadow-sm p-1', className)}
>
	<div class="text-base font-sans text-black flex flex-wrap items-center gap-1">
		<span>{translate('viewFilters')}</span>
		{#each displayedRecordTypes as recordType, index}
			<Tag variant="selected-outline">{recordType}</Tag>
			{#if index < displayedRecordTypes.length - 1}
				<span>{translate('or')}</span>
			{/if}
		{/each}
		{#if displayedPlaceTypes.length > 0}
			<span>{translate('statusAtScale')}</span>
			{#each displayedPlaceTypes as placeType, index}
				<Tag variant="selected-outline">{placeType}</Tag>
				{#if index < displayedPlaceTypes.length - 1}
					<span>{translate('or')}</span>
				{/if}
			{/each}
		{/if}
		<span>{translate('statusInDatasets')}</span>
		{#each displayedDatasets as dataset, index}
			<Tag variant="selected-outline">{dataset}</Tag>
			{#if index < displayedDatasets.length - 1}
				<span>{translate('and')}</span>
			{/if}
		{/each}
		{#if selectedPlace}
			<span>{translate('statusInCellsOf')}</span>
			<Tag variant="selected-outline">
				<span class="inline-flex align-[-2px] mr-1"><MapPin size={14} weight="bold" /></span>{formatPlaceTitle(selectedPlace)}
			</Tag>
		{/if}
		{#if searchQuery}
			<span>{translate('statusWithSearch')}</span>
			<Tag variant="selected-outline">
				<span class="inline-flex align-[-2px] mr-1"><MagnifyingGlass size={14} weight="bold" /></span>{searchQuery}
			</Tag>
		{/if}
		{#if selectedTags.length > 0}
			<span>{translate('statusAboutTopics')}</span>
			{#each selectedTags as tag, index}
				<Tag variant="selected-outline">{translate(tag)}</Tag>
				{#if index < selectedTags.length - 1}
					<span>{tagJoiner}</span>
				{/if}
			{/each}
		{/if}
	</div>
</div>
