<!--
	The map's filter sidebar: record type, dataset, geometry, and (when ready) topics.
	Owns the URL writing — each change sets/deletes its query param and navigates, which
	re-runs the loader and re-fetches the map data.
-->
<script lang="ts">
	import { asset } from '$app/paths';
	import type { RecordType, PlaceType, PlaceSearchMatch } from '@atm/shared/types';
	import { translate, translateAll, reverseTranslateAll } from '$utils/translations';
	import { navigateParams, withoutPlace } from '$utils/navigate';
	import QuestionMark from 'phosphor-svelte/lib/QuestionMark';
	import Heading from './Heading.svelte';
	import Tooltip from './Tooltip.svelte';
	import TextWithSlots from './TextWithSlots.svelte';
	import ToggleGroup from './ToggleGroup.svelte';
	import Tag from './Tag.svelte';
	import FilterSection from './FilterSection.svelte';
import PlaceSearchInput from './PlaceSearchInput.svelte';
import PlaceFilterTag from './PlaceFilterTag.svelte';
import FeatureSearchInput from './FeatureSearchInput.svelte';
import SearchFilterTag from './SearchFilterTag.svelte';
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
		selectedPlace?: PlaceSearchMatch | null;
		onTogglePlacePanel?: () => void;
		placePanelOpen?: boolean;
		currentSearchQuery?: string | null;
		searchPaused?: boolean;
		onToggleSearch?: () => void;
		// current filter params, forwarded so the search preview count matches them
		filterQuery?: string;
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
		currentTagOperator = 'OR',
		selectedPlace = null,
		onTogglePlacePanel = undefined,
		placePanelOpen = false,
		currentSearchQuery = null,
		searchPaused = false,
		onToggleSearch = undefined,
		filterQuery = ''
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

	function handleRecordTypeChange(selected: string[] | string) {
		const dutch = Array.isArray(selected) ? selected : [selected];
		const english = reverseTranslateAll(dutch);
		navigateParams((p) => {
			if (english.length > 0) p.set('recordTypes', english.join(','));
			else p.delete('recordTypes');
			p.delete('tags'); // resetTags
		});
	}

	function handleDatasetChange(selected: string[] | string) {
		const labels = Array.isArray(selected) ? selected : [selected];
		const labelToId = new Map(datasets.map((s) => [s.label, s.id]));
		const ids = labels.map((label) => labelToId.get(label) || label);
		navigateParams((p) => {
			if (ids.length > 0) p.set('datasets', ids.join(','));
			else p.delete('datasets');
		});
	}

	function handlePlaceTypeChange(selected: string[] | string) {
		const dutch = Array.isArray(selected) ? selected : [selected];
		const raw = reverseTranslateAll(dutch);
		navigateParams((p) => {
			if (raw.length > 0) p.set('placeTypes', raw.join(','));
			else p.delete('placeTypes');
		});
	}

	function handleTagsChange(tags: string | string[]) {
		const tagArray = Array.isArray(tags) ? tags : [tags];
		navigateParams((p) => {
			if (tagArray.length > 0) p.set('tags', tagArray.join(','));
			else p.delete('tags');
		});
	}

	// a picked place opens its panel at once; the cell gives way to it
	function handlePlaceSelect(match: PlaceSearchMatch) {
		navigateParams((p) => {
			p.set('place', match.placeId);
			if (match.matchedNameId) {
				p.set('name', match.matchedNameId);
			} else {
				p.delete('name');
			}
			p.set('placePanel', '1');
			p.delete('cell');
		});
	}

	function handlePlaceClear() {
		navigateParams(withoutPlace);
	}

	function handleSearchApply(q: string) {
		navigateParams((p) => {
			p.set('q', q);
		});
	}

	function handleSearchClear() {
		navigateParams((p) => {
			p.delete('q');
			// bestMatch order is meaningless without a query
			if (p.get('sort') === 'bestMatch') {
				p.delete('sort');
			}
		});
	}

	function handleTagOperatorChange(operator: 'AND' | 'OR') {
		tagOperator = operator;
		selectedTags = [];
		navigateParams((p) => {
			p.set('tagOperator', operator);
			p.delete('tags'); // resetTags
		});
	}
</script>

<div class="p-3">
	<div class="mb-4">
		<Heading level={2} class="font-bold text-lg mb-2"> Filters </Heading>

		<div class="mb-4">
			<div class="flex mb-2">
				<Heading level={3} class="pr-2">Plek</Heading>
				<Tooltip icon={QuestionMark} placement="bottom">
					<TextWithSlots text={translate('placeSearchTooltip')}>
						{#snippet children(slot)}
							{#if slot === 'border'}
								<img src={asset('/glyphs/PlaceBorder.svg')} alt="" width="24" height="24" class="inline align-middle mx-1" />
							{/if}
						{/snippet}
					</TextWithSlots>
				</Tooltip>
			</div>
			<PlaceSearchInput onSelect={handlePlaceSelect} {selectedPlace} />
			{#if selectedPlace}
				<div class="mt-2">
					<PlaceFilterTag place={selectedPlace} onClear={handlePlaceClear} onToggle={onTogglePlacePanel} active={placePanelOpen} />
				</div>
			{/if}
		</div>

		<div class="mb-4">
			<div class="flex mb-2">
				<Heading level={3} class="pr-2">Zoekterm</Heading>
				<Tooltip icon={QuestionMark} placement="bottom">{translate('searchTooltip')}</Tooltip>
			</div>
			<FeatureSearchInput onApply={handleSearchApply} {filterQuery} />
			{#if currentSearchQuery}
				<div class="mt-2">
					<SearchFilterTag query={currentSearchQuery} onClear={handleSearchClear} onToggle={onToggleSearch} active={!searchPaused} />
				</div>
			{/if}
		</div>

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
				<Tooltip icon={QuestionMark} placement="bottom">Thematic categories based on newspaper sections, applied across all data using machine learning.</Tooltip>
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
