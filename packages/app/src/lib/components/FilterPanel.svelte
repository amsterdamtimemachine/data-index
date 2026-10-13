<!--
	The map's filter sidebar: search (place or term), record type, dataset, scale, topics.
	Owns the URL writing — each change sets/deletes its query param and navigates, which
	re-runs the loader and re-fetches the map data.
-->
<script lang="ts">
	import { asset } from '$app/paths';
	import type { PlaceSearchMatch, VisualizationMetadata } from '@atm/shared/types';
	import type { FilterState } from '$types/filters';
	import { translate, translateAll, reverseTranslateAll } from '$utils/translations';
	import { navigateParams, withoutPlace } from '$utils/navigate';
	import { createTagCounts } from '$lib/state/tag-counts.svelte';
	import Heading from './Heading.svelte';
	import TextWithSlots from './TextWithSlots.svelte';
	import FilterSection from './FilterSection.svelte';
	import FilterToggleGroup from './FilterToggleGroup.svelte';
	import SearchInput from './SearchInput.svelte';
	import PlaceFilterTag from './PlaceFilterTag.svelte';
	import SearchFilterTag from './SearchFilterTag.svelte';
	import Button from './Button.svelte';
	import X from 'phosphor-svelte/lib/X';
	import TagOperatorSwitch from './TagOperatorSwitch.svelte';

	interface Props {
		metadata: VisualizationMetadata | null;
		// the URL's filter state, what the controls show
		filters: FilterState;
		// the applied filters as request params (a paused search term left out), so the
		// preview counts match what the map shows
		activeParams?: string;
		selectedPlace?: PlaceSearchMatch | null;
		onTogglePlacePanel?: () => void;
		placePanelOpen?: boolean;
		searchPaused?: boolean;
		onToggleSearch?: () => void;
	}

	let {
		metadata,
		filters,
		activeParams = '',
		selectedPlace = null,
		onTogglePlacePanel = undefined,
		placePanelOpen = false,
		searchPaused = false,
		onToggleSearch = undefined
	}: Props = $props();

	const recordTypes = $derived(metadata?.recordTypes ?? []);
	const placeTypes = $derived(metadata?.placeTypes ?? []);
	const datasets = $derived(metadata?.datasets ?? []);
	const availableTags = $derived(metadata?.tags ?? []);
	const currentTags = $derived(filters.tags);
	const currentTagOperator = $derived(filters.tagOperator);
	const currentSearchQuery = $derived(filters.searchQuery);

	// Dutch labels for display; the handlers translate the selection back before writing it.
	let translatedRecordTypes = $derived(translateAll(recordTypes));
	let translatedCurrentRecordTypes = $derived(translateAll(filters.recordTypes));
	let translatedPlaceTypes = $derived(translateAll(placeTypes));
	let translatedCurrentPlaceTypes = $derived(translateAll(filters.placeTypes));

	let datasetLabels = $derived(datasets.map((s) => s.label));
	let datasetLookup = $derived(new Map(datasets.map((s) => [s.id, s.label])));
	let currentDatasetLabels = $derived(filters.datasets.map((id) => datasetLookup.get(id) || id));

	// Tags render by Dutch label like the other filters; the handler translates back.
	let translatedTags = $derived(translateAll(availableTags));
	let translatedCurrentTags = $derived(translateAll(currentTags));

	// Per-tag counts under the other filters, used only to grey out empty tags. The
	// selection itself is stripped so toggling a tag never refetches counts that cannot change.
	const tagCounts = createTagCounts();
	const tagCountsQuery = $derived.by(() => {
		const params = new URLSearchParams(activeParams);
		params.delete('tags');
		params.delete('tagOperator');
		return params.toString();
	});
	// A boolean derived, not the array: a reloaded metadata array must not refetch.
	const hasTags = $derived(availableTags.length > 0);
	$effect(() => {
		if (hasTags) {
			tagCounts.load(tagCountsQuery);
		}
	});
	const tagCountByLabel = $derived.by(() => {
		const byLabel = new Map<string, number>();
		if (!tagCounts.counts) {
			return byLabel;
		}
		for (const id of availableTags) {
			byLabel.set(translate(id), tagCounts.counts.get(id) ?? 0);
		}
		return byLabel;
	});
	// A tag with nothing behind it under the current filters is greyed out, unless it
	// is selected (so it can still be deselected).
	const disabledTagLabels = $derived.by(() => {
		if (!tagCounts.counts) {
			return [];
		}
		return translatedTags.filter((label) => tagCountByLabel.get(label) === 0 && !translatedCurrentTags.includes(label));
	});

	// bestMatch ranks against the term and the tags; with neither left it means nothing
	function dropIdleBestMatch(p: URLSearchParams) {
		if (p.get('sort') === 'bestMatch' && !p.get('q') && !p.get('tags')) {
			p.delete('sort');
		}
	}

	function handleRecordTypeChange(selected: string[] | string) {
		const dutch = Array.isArray(selected) ? selected : [selected];
		const english = reverseTranslateAll(dutch);
		navigateParams((p) => {
			if (english.length > 0) p.set('recordTypes', english.join(','));
			else p.delete('recordTypes');
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

	function handleTagsChange(selected: string | string[]) {
		const dutch = Array.isArray(selected) ? selected : [selected];
		const ids = reverseTranslateAll(dutch);
		navigateParams((p) => {
			if (ids.length > 0) p.set('tags', ids.join(','));
			else p.delete('tags');
			dropIdleBestMatch(p);
		});
	}

	function handleTagsClear() {
		navigateParams((p) => {
			p.delete('tags');
			dropIdleBestMatch(p);
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
			dropIdleBestMatch(p);
		});
	}

	// The selection survives an operator change; the counts and the map answer for it.
	function handleTagOperatorChange(operator: 'AND' | 'OR') {
		navigateParams((p) => {
			p.set('tagOperator', operator);
		});
	}
</script>

<div class="p-3">
	<div class="mb-4">
		<Heading level={2} class="font-bold text-lg mb-2">{translate('filters')}</Heading>

		<FilterSection heading={translate('searchFilter')}>
			{#snippet tooltip()}
				<TextWithSlots text={translate('searchTooltip')}>
					{#snippet children(slot)}
						{#if slot === 'border'}
							<img src={asset('/glyphs/PlaceBorder.svg')} alt="" width="24" height="24" class="inline align-middle mx-1" />
						{/if}
					{/snippet}
				</TextWithSlots>
			{/snippet}
			<SearchInput onApplySearch={handleSearchApply} onSelectPlace={handlePlaceSelect} filterQuery={activeParams} />
			{#if selectedPlace}
				<div class="mt-2">
					<PlaceFilterTag place={selectedPlace} onClear={handlePlaceClear} onToggle={onTogglePlacePanel} active={placePanelOpen} />
				</div>
			{/if}
			{#if currentSearchQuery}
				<div class="mt-2">
					<SearchFilterTag query={currentSearchQuery} onClear={handleSearchClear} onToggle={onToggleSearch} active={!searchPaused} />
				</div>
			{/if}
		</FilterSection>

		<FilterSection heading={translate('recordTypeFilter')}>
			<FilterToggleGroup
				items={translatedRecordTypes}
				selectedItems={translatedCurrentRecordTypes}
				onItemSelected={handleRecordTypeChange}
			/>
		</FilterSection>
	</div>

	<FilterSection heading={translate('datasetFilter')}>
		{#snippet tooltip()}
			{translate('datasetFilterTooltip')}
		{/snippet}
		<FilterToggleGroup items={datasetLabels} selectedItems={currentDatasetLabels} onItemSelected={handleDatasetChange} />
	</FilterSection>

	{#if placeTypes.length > 1}
		<FilterSection heading={translate('scaleFilter')}>
			{#snippet tooltip()}
				{translate('scaleFilterTooltip')}
			{/snippet}
			<FilterToggleGroup
				items={translatedPlaceTypes}
				selectedItems={translatedCurrentPlaceTypes}
				onItemSelected={handlePlaceTypeChange}
			/>
		</FilterSection>
	{/if}

	{#if availableTags.length > 0}
		<FilterSection heading={translate('topics')}>
			{#snippet tooltip()}
				{translate('topicsTooltip')}
			{/snippet}
			<TagOperatorSwitch
				operator={currentTagOperator}
				onOperatorChange={handleTagOperatorChange}
				anyLabel={translate('topicsAny')}
				allLabel={translate('topicsAll')}
				class="mb-2"
			/>
			{#if currentTags.length > 0}
				<Button icon={X} size={16} onclick={handleTagsClear} class="mb-2">{translate('clearAll')}</Button>
			{/if}
			<FilterToggleGroup
				items={translatedTags}
				selectedItems={translatedCurrentTags}
				disabledItems={disabledTagLabels}
				onItemSelected={handleTagsChange}
				requireOne={false}
			/>
		</FilterSection>
	{/if}
</div>
