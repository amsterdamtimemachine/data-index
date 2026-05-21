<script lang="ts">
	import { mergeCss } from '$utils/utils';
	import { translateContentTypes } from '$utils/translations';
	import Tag from './Tag.svelte';
	import type { RecordType } from '@atm/shared/types';

	interface Props {
		selectedRecordTypes: RecordType[];
		allRecordTypes: RecordType[];
		selectedPlaceTypes?: string[];
		allPlaceTypes?: string[];
		selectedDatasets: string[];
		allDatasets: string[];
		selectedTags: string[];
		tagOperator?: 'AND' | 'OR';
		class?: string;
	}

	let {
		selectedRecordTypes,
		allRecordTypes,
		selectedPlaceTypes = [],
		allPlaceTypes = [],
		selectedDatasets,
		allDatasets,
		selectedTags,
		tagOperator = 'OR',
		class: className
	}: Props = $props();

	const hasAllTypes = $derived(
		selectedRecordTypes.length === 0 ||
			(selectedRecordTypes.length === allRecordTypes.length &&
				allRecordTypes.every((type) => selectedRecordTypes.includes(type)))
	);

	const hasAllPlaceTypes = $derived(
		selectedPlaceTypes.length === 0 ||
			(selectedPlaceTypes.length === allPlaceTypes.length &&
				allPlaceTypes.every((pt) => selectedPlaceTypes.includes(pt)))
	);

	const hasAllDatasets = $derived(
		selectedDatasets.length === 0 ||
			(selectedDatasets.length === allDatasets.length &&
				allDatasets.every((ds) => selectedDatasets.includes(ds)))
	);

	const displayedRecordTypes = $derived(
		translateContentTypes(hasAllTypes ? allRecordTypes : selectedRecordTypes)
	);

	const displayedPlaceTypes = $derived(
		hasAllPlaceTypes ? [] : selectedPlaceTypes
	);

	const displayedDatasets = $derived(
		hasAllDatasets ? allDatasets : selectedDatasets
	);
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
		{#if selectedTags.length > 0}
			<span>{tagOperator === 'AND' ? 'en' : 'of'}</span>
			{#each selectedTags as tag, index}
				<Tag variant="selected">{tag}</Tag>
				{#if index < selectedTags.length - 1}
					<span>{tagOperator === 'AND' ? 'en' : 'of'}</span>
				{/if}
			{/each}
		{/if}
	</div>
</div>
