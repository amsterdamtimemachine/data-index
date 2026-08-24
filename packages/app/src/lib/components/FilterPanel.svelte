<!--
	The map's filter sidebar: record type, dataset, geometry, and (when ready) topics.
	Owns the URL writing — each change sets/deletes its query param and navigates, which
	re-runs the loader and re-fetches the map data.
-->
<script lang="ts">
	import { goto } from '$app/navigation';
	import type { RecordType, PlaceType } from '@atm/shared/types';
	import { translateAll, reverseTranslateAll } from '$utils/translations';
	import QuestionMark from 'phosphor-svelte/lib/QuestionMark';
	import Heading from './Heading.svelte';
	import Tooltip from './Tooltip.svelte';
	import ToggleGroup from './ToggleGroup.svelte';
	import Tag from './Tag.svelte';
	import FilterSection from './FilterSection.svelte';
import PlaceSearchInput from './PlaceSearchInput.svelte';
	import TagsANDSelector from './TagsANDSelector.svelte';
	import TagOperatorSwitch from './TagOperatorSwitch.svelte';
	import DummyTagsSection from './DummyTagsSection.svelte';

	interface Props {
		recordTypes?: RecordType[];
		currentRecordTypes?: RecordType[];
		placeTypes?: PlaceType[];
		currentPlaceTypes?: PlaceType[];
		datasets?: { id: string; label: string }[];
		currentDatasets?: string[];
		availableTags?: string[];
		currentTags?: string[];
		currentTagOperator?: 'AND' | 'OR';
	}

	let {
		recordTypes = [],
		currentRecordTypes = [],
		placeTypes = [],
		currentPlaceTypes = [],
		datasets = [],
		currentDatasets = [],
		availableTags = [],
		currentTags = [],
		currentTagOperator = 'OR'
	}: Props = $props();

	// keep false until real tags are added to the app
	const TAGS_FEATURE_READY = false;

	// Dutch labels for display; the handlers translate the selection back before writing it.
	let translatedRecordTypes = $derived(translateAll(recordTypes));
	let translatedCurrentRecordTypes = $derived(translateAll(currentRecordTypes));
	let translatedPlaceTypes = $derived(translateAll(placeTypes));
	let translatedCurrentPlaceTypes = $derived(translateAll(currentPlaceTypes));

	let datasetLabels = $derived(datasets.map((s) => s.label));
	let datasetLookup = $derived(new Map(datasets.map((s) => [s.id, s.label])));
	let currentDatasetLabels = $derived(currentDatasets.map((id) => datasetLookup.get(id) || id));

	// Local mirrors so the disabled topics UI can update optimistically before the
	// navigation lands; the props take over again on the next load.
	let tagOperator = $derived<'AND' | 'OR'>(currentTagOperator);
	let selectedTags = $derived<string[]>(currentTags);

	function navigate(mutate: (params: URLSearchParams) => void) {
		const url = new URL(window.location.href);
		mutate(url.searchParams);
		goto(url.pathname + url.search);
	}

	function handleRecordTypeChange(selected: string[] | string) {
		const dutch = Array.isArray(selected) ? selected : [selected];
		const english = reverseTranslateAll(dutch);
		navigate((p) => {
			if (english.length > 0) p.set('recordTypes', english.join(','));
			else p.delete('recordTypes');
			p.delete('tags'); // resetTags
		});
	}

	function handleDatasetChange(selected: string[] | string) {
		const labels = Array.isArray(selected) ? selected : [selected];
		const labelToId = new Map(datasets.map((s) => [s.label, s.id]));
		const ids = labels.map((label) => labelToId.get(label) || label);
		navigate((p) => {
			if (ids.length > 0) p.set('datasets', ids.join(','));
			else p.delete('datasets');
		});
	}

	function handlePlaceTypeChange(selected: string[] | string) {
		const dutch = Array.isArray(selected) ? selected : [selected];
		const raw = reverseTranslateAll(dutch);
		navigate((p) => {
			if (raw.length > 0) p.set('placeTypes', raw.join(','));
			else p.delete('placeTypes');
		});
	}

	function handleTagsChange(tags: string | string[]) {
		const tagArray = Array.isArray(tags) ? tags : [tags];
		navigate((p) => {
			if (tagArray.length > 0) p.set('tags', tagArray.join(','));
			else p.delete('tags');
		});
	}

	function handleTagOperatorChange(operator: 'AND' | 'OR') {
		tagOperator = operator;
		selectedTags = [];
		navigate((p) => {
			p.set('tagOperator', operator);
			p.delete('tags'); // resetTags
		});
	}
</script>

<div class="p-3">
	<div class="mb-4">
		<PlaceSearchInput />
	</div>

	<div class="mb-4">
		<Heading level={2} class="font-bold text-lg mb-2"> Filters </Heading>

		<FilterSection
			heading="Inhoudstype"
			tooltip="De data index bevat een selectie van afbeeldingen, persoonsdata en teksten uit Nederlandse kranten."
			items={translatedRecordTypes}
			selectedItems={translatedCurrentRecordTypes}
			onItemSelected={handleRecordTypeChange}
		/>
	</div>

	<FilterSection
		heading="Dataset"
		tooltip="Filter op basis van de dataset waaruit de data afkomstig is."
		items={datasetLabels}
		selectedItems={currentDatasetLabels}
		onItemSelected={handleDatasetChange}
	/>

	{#if placeTypes.length > 1}
		<FilterSection
			heading="Geometrie"
			tooltip="Filter op basis van het type locatie waarmee de data is verbonden."
			items={translatedPlaceTypes}
			selectedItems={translatedCurrentPlaceTypes}
			onItemSelected={handlePlaceTypeChange}
		/>
	{/if}

	<!-- Topics Section - Use dummy version until tags data is ready -->
	{#if TAGS_FEATURE_READY}
		<div class="mb-4">
			<div class="flex">
				<Heading level={3} class="pr-2"> Onderwerpen </Heading>
				<Tooltip icon={QuestionMark} text="Thematic categories based on newspaper sections, applied across all data using machine learning." placement="bottom" />
			</div>
			<div class="mt-2 mb-3">
				<TagOperatorSwitch
					operator={tagOperator}
					onOperatorChange={handleTagOperatorChange}
					class="block"
				/>
				<span class="text-xs text-black">
					{tagOperator === 'AND' ? 'Include only content with all selected topics' : 'Include content with any selected topics'}
				</span>
			</div>
		</div>

		{#if tagOperator === 'AND'}
			<TagsANDSelector
				recordTypes={currentRecordTypes}
				allRecordTypes={recordTypes}
				availableTags={availableTags}
				selectedTags={selectedTags}
				onTagsSelected={handleTagsChange}
			/>
		{:else}
			<ToggleGroup
				items={availableTags}
				selectedItems={selectedTags}
				onItemSelected={handleTagsChange}
				requireOneItemSelected={false}>
				{#snippet children(item, isSelected, isDisabled)}
					<Tag variant={isSelected ? 'selected' : 'default'} disabled={isDisabled} interactive={true}>
						{item}
					</Tag>
				{/snippet}
			</ToggleGroup>
		{/if}
	{:else}
		<DummyTagsSection />
	{/if}
</div>
