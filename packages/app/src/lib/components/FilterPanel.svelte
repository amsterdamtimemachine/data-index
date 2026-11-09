<!--
	The map's filter sidebar: search (place or term), record type, dataset, scale, topics.
	Owns the URL writing — each change sets/deletes its query param and navigates, which
	re-runs the loader and re-fetches the map data.
-->
<script lang="ts">
	import { asset } from '$app/paths';
	import type { PlaceSearchMatch, VisualizationMetadata } from '@atm/shared/types';
	import type { FilterState } from '#lib/types/filters.js';
	import { translate, translateAll, reverseTranslateAll } from '#lib/utils/translations.js';
	import { navigateParams, withoutPlace } from '#lib/utils/navigate.js';
	import { createFilterCounts } from '#lib/state/filter-counts.svelte.js';
	import Heading from './Heading.svelte';
	import TextWithSlots from './TextWithSlots.svelte';
	import FilterSection from './FilterSection.svelte';
	import FilterToggleGroup from './FilterToggleGroup.svelte';
	import SearchInput from './SearchInput.svelte';
	import PlaceFilterTag from './PlaceFilterTag.svelte';
	import SearchFilterTag from './SearchFilterTag.svelte';
	import Link from './Link.svelte';
	import { selectsAll, NONE, CATEGORIES, type Category } from '#lib/utils/filters.js';
	import type { ValueCount } from '@atm/shared/types';
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
		// a category is empty: nothing to list, so the search's preview count stays quiet
		idle?: boolean;
		// the period and, in the timeline's local mode, the cell or place the counts are taken within
		countsScope?: string;
	}

	let {
		metadata,
		filters,
		activeParams = '',
		selectedPlace = null,
		onTogglePlacePanel = undefined,
		placePanelOpen = false,
		searchPaused = false,
		onToggleSearch = undefined,
		idle = false,
		countsScope = ''
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
	const datasetIds = $derived(datasets.map((s) => s.id));
	let currentDatasetLabels = $derived(filters.datasets.map((id) => datasetLookup.get(id) || id));

	// Tags render by Dutch label like the other filters; the handler translates back.
	let translatedTags = $derived(translateAll(availableTags));
	let translatedCurrentTags = $derived(translateAll(currentTags));

	// What every filter value is worth under the other filters, the period and the scope,
	// shown beside it. The applied filters travel as they are, an emptied category as
	// 'none', so the server counts that category's own values and zeroes the rest.
	const filterCounts = createFilterCounts();
	const countsQuery = $derived.by(() => {
		const params = new URLSearchParams(activeParams);
		if (metadata) {
			for (const category of CATEGORIES) {
				if (filters[category].length === 0) {
					params.set(category, NONE);
				}
			}
		}
		for (const [name, value] of new URLSearchParams(countsScope)) {
			params.set(name, value);
		}
		return params.toString();
	});
	const hasMetadata = $derived(metadata !== null);
	$effect(() => {
		if (hasMetadata) {
			filterCounts.load(countsQuery);
		} else {
			filterCounts.reset();
		}
	});
	// a list's counts keyed by the label the toggle shows, every known value present
	function countsByLabel(
		ids: string[],
		label: (id: string) => string,
		counted: ValueCount[] | undefined
	): Map<string, number> | undefined {
		if (!counted) {
			return undefined;
		}
		const byId = new Map(counted.map((c) => [c.id, c.count]));
		return new Map(ids.map((id) => [label(id), byId.get(id) ?? 0]));
	}
	const recordTypeCounts = $derived(
		countsByLabel(recordTypes, translate, filterCounts.counts?.recordTypes)
	);
	const datasetCounts = $derived(
		countsByLabel(datasetIds, (id) => datasetLookup.get(id) || id, filterCounts.counts?.datasets)
	);
	const placeTypeCounts = $derived(
		countsByLabel(placeTypes, translate, filterCounts.counts?.placeTypes)
	);
	const tagCounts = $derived(countsByLabel(availableTags, translate, filterCounts.counts?.tags));

	// a category's param: absent for everything, NONE for nothing, else the picks
	function writeCategory(p: URLSearchParams, name: Category, values: string[], all: string[]) {
		if (selectsAll(values, all)) {
			p.delete(name);
		} else if (values.length === 0) {
			p.set(name, NONE);
		} else {
			p.set(name, values.join(','));
		}
	}

	function handleRecordTypeChange(selected: string[]) {
		const english = reverseTranslateAll(selected);
		navigateParams((p) => writeCategory(p, 'recordTypes', english, recordTypes));
	}

	function handleDatasetChange(selected: string[]) {
		const labelToId = new Map(datasets.map((s) => [s.label, s.id]));
		const ids = selected.map((label) => labelToId.get(label) || label);
		navigateParams((p) => writeCategory(p, 'datasets', ids, datasetIds));
	}

	function handlePlaceTypeChange(selected: string[]) {
		const raw = reverseTranslateAll(selected);
		navigateParams((p) => writeCategory(p, 'placeTypes', raw, placeTypes));
	}

	// the header button: with everything pressed it releases all, else it presses all
	function handleCategoryToggle(name: Category, all: string[]) {
		const allPressed = selectsAll(filters[name], all);
		navigateParams((p) => writeCategory(p, name, allPressed ? [] : all, all));
	}

	function handleTagsChange(selected: string[]) {
		const dutch = selected;
		const ids = reverseTranslateAll(dutch);
		navigateParams((p) => {
			if (ids.length > 0) p.set('tags', ids.join(','));
			else p.delete('tags');
		});
	}

	function handleTagsClear() {
		navigateParams((p) => {
			p.delete('tags');
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
		});
	}

	// The selection survives an operator change; the counts and the map answer for it.
	function handleTagOperatorChange(operator: 'AND' | 'OR') {
		navigateParams((p) => {
			p.set('tagOperator', operator);
		});
	}
</script>

{#snippet categoryToggle(name: Category, all: string[])}
	<Link onclick={() => handleCategoryToggle(name, all)}>
		{selectsAll(filters[name], all) ? translate('clearAll') : translate('selectAll')}
	</Link>
{/snippet}

<div class="p-3">
	<div class="mb-4">
		<Heading level={2} class="font-bold text-lg mb-2">{translate('filters')}</Heading>

		<FilterSection heading={translate('searchFilter')}>
			{#snippet tooltip()}
				<TextWithSlots text={translate('searchTooltip')}>
					{#snippet children(slot)}
						{#if slot === 'border'}
							<img
								src={asset('glyphs/PlaceBorder.svg')}
								alt=""
								width="24"
								height="24"
								class="inline align-middle mx-1"
							/>
						{/if}
					{/snippet}
				</TextWithSlots>
			{/snippet}
			<SearchInput
				onApplySearch={handleSearchApply}
				onSelectPlace={handlePlaceSelect}
				filterQuery={idle ? null : activeParams}
			/>
			{#if selectedPlace}
				<div class="mt-2">
					<PlaceFilterTag
						place={selectedPlace}
						onClear={handlePlaceClear}
						onToggle={onTogglePlacePanel}
						active={placePanelOpen}
					/>
				</div>
			{/if}
			{#if currentSearchQuery}
				<div class="mt-2">
					<SearchFilterTag
						query={currentSearchQuery}
						onClear={handleSearchClear}
						onToggle={onToggleSearch}
						active={!searchPaused}
					/>
				</div>
			{/if}
		</FilterSection>

		<FilterSection heading={translate('recordTypeFilter')}>
			{#snippet action()}
				{@render categoryToggle('recordTypes', recordTypes)}
			{/snippet}
			{#snippet children(headingId)}
				<FilterToggleGroup
					items={translatedRecordTypes}
					selectedItems={translatedCurrentRecordTypes}
					counts={recordTypeCounts}
					onItemSelected={handleRecordTypeChange}
					requireOne={false}
					labelledBy={headingId}
				/>
			{/snippet}
		</FilterSection>
	</div>

	<FilterSection heading={translate('datasetFilter')}>
		{#snippet tooltip()}
			{translate('datasetFilterTooltip')}
		{/snippet}
		{#snippet action()}
			{@render categoryToggle('datasets', datasetIds)}
		{/snippet}
		{#snippet children(headingId)}
			<FilterToggleGroup
				items={datasetLabels}
				selectedItems={currentDatasetLabels}
				counts={datasetCounts}
				onItemSelected={handleDatasetChange}
				requireOne={false}
				labelledBy={headingId}
			/>
		{/snippet}
	</FilterSection>

	{#if placeTypes.length > 1}
		<FilterSection heading={translate('scaleFilter')}>
			{#snippet tooltip()}
				{translate('scaleFilterTooltip')}
			{/snippet}
			{#snippet action()}
				{@render categoryToggle('placeTypes', placeTypes)}
			{/snippet}
			{#snippet children(headingId)}
				<FilterToggleGroup
					items={translatedPlaceTypes}
					selectedItems={translatedCurrentPlaceTypes}
					counts={placeTypeCounts}
					onItemSelected={handlePlaceTypeChange}
					requireOne={false}
					labelledBy={headingId}
				/>
			{/snippet}
		</FilterSection>
	{/if}

	{#if availableTags.length > 0}
		<FilterSection heading={translate('topics')}>
			{#snippet tooltip()}
				{translate('topicsTooltip')}
			{/snippet}
			{#snippet action()}
				{#if currentTags.length > 0}
					<Link onclick={handleTagsClear}>{translate('clearAll')}</Link>
				{/if}
			{/snippet}
			{#snippet children(headingId)}
				<TagOperatorSwitch
					operator={currentTagOperator}
					onOperatorChange={handleTagOperatorChange}
					anyLabel={translate('topicsAny')}
					allLabel={translate('topicsAll')}
					class="mb-2"
				/>
				<FilterToggleGroup
					items={translatedTags}
					selectedItems={translatedCurrentTags}
					counts={tagCounts}
					onItemSelected={handleTagsChange}
					requireOne={false}
					labelledBy={headingId}
				/>
			{/snippet}
		</FilterSection>
	{/if}
</div>
