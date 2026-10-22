<!--
	The one search box: a term to apply to the titles, or a place to scope the map to.
	Typing only fills the dropdown; the map changes on a choice. The text row comes
	first with its count under the current filters, then the places.
-->
<script lang="ts">
	import Combobox from '#lib/components/Combobox.svelte';
	import SearchOptionRow from '#lib/components/SearchOptionRow.svelte';
	import TextWithSlots from '#lib/components/TextWithSlots.svelte';
	import MagnifyingGlass from 'phosphor-svelte/lib/MagnifyingGlass';
	import MapPin from 'phosphor-svelte/lib/MapPin';
	import { createPlaceSearch } from '#lib/state/place-search.svelte.js';
	import { createSearchCount } from '#lib/state/search-count.svelte.js';
	import { translate } from '#lib/utils/translations.js';
	import { formatPlaceWindow } from '#lib/utils/format.js';
	import { searchOptions, parseSearchChoice } from '#lib/utils/search-options.js';
	import { mapSelection } from '#lib/state/map-selection.svelte.js';
	import type { PlaceSearchMatch } from '@atm/shared/types';

	type Props = {
		onApplySearch: (q: string) => void;
		onSelectPlace: (match: PlaceSearchMatch) => void;
		// current filter params, so the count matches what applying will show
		filterQuery?: string;
	};
	let { onApplySearch, onSelectPlace, filterQuery = '' }: Props = $props();

	const placeSearch = createPlaceSearch();
	const searchCount = createSearchCount();
	let query = $state('');

	function handleInput(text: string) {
		query = text;
		placeSearch.setQuery(text);
		searchCount.setQuery(text, filterQuery);
	}

	const optionSet = $derived(searchOptions(query, placeSearch.matches));

	const countText = $derived.by(() => {
		if (searchCount.count === null) {
			return undefined;
		}
		return String(searchCount.count);
	});

	function placeDetail(match: PlaceSearchMatch): string {
		let detail = translate(match.type);
		const period = formatPlaceWindow(match);
		if (period) {
			detail = `${detail} · ${period}`;
		}
		return detail;
	}

	// the highlighted result outlines its cells on the map
	function handleHighlight(value: string | null) {
		let place = null;
		if (value) {
			const choice = parseSearchChoice(value);
			if (choice?.kind === 'place') {
				place = optionSet.places.find((p) => p.match.placeId === choice.placeId) ?? null;
			}
		}
		if (place) {
			mapSelection.hoverPlace(place.match);
		} else {
			mapSelection.hoverPlace(null);
		}
	}
	$effect(() => {
		return () => mapSelection.hoverPlace(null);
	});

	function handleSelect(value: string) {
		const choice = parseSearchChoice(value);
		if (!choice) {
			return;
		}
		if (choice.kind === 'text') {
			onApplySearch(choice.query);
			return;
		}
		const place = optionSet.places.find((p) => p.match.placeId === choice.placeId);
		if (place) {
			onSelectPlace(place.match);
		}
	}
</script>

<Combobox
	options={optionSet.options}
	onInput={handleInput}
	onSelect={handleSelect}
	onHighlight={handleHighlight}
	clearOnSelect={true}
	placeholder={translate('searchPlaceholder')}
	aria-label={translate('searchPlaceholder')}
>
	{#snippet children(getOption)}
		{#if optionSet.text}
			{@const text = optionSet.text}
			<SearchOptionRow attributes={getOption(text)} icon={MagnifyingGlass} trailing={countText}>
				<TextWithSlots text={translate('searchInTitles')}>
					{#snippet children(slot)}
						{#if slot === 'term'}
							{text.label}
						{/if}
					{/snippet}
				</TextWithSlots>
			</SearchOptionRow>
		{/if}
		{#each optionSet.places as place (place.option.value)}
			<SearchOptionRow attributes={getOption(place.option)} icon={MapPin} trailing={placeDetail(place.match)}>
				{place.option.label}
			</SearchOptionRow>
		{/each}
	{/snippet}
</Combobox>
