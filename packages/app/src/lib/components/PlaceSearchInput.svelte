<script lang="ts">
	import Combobox from '$components/Combobox.svelte';
	import { createPlaceSearch } from '$lib/state/place-search.svelte';
	import { translate } from '$utils/translations';
	import { formatPlaceWindow } from '$utils/format';
	import type { PlaceSearchMatch } from '@atm/shared/types';

	type Props = {
		onSelect?: (match: PlaceSearchMatch) => void;
		selectedPlace?: PlaceSearchMatch | null;
	};
	let { onSelect, selectedPlace = null }: Props = $props();

	const selectedLabel = $derived.by(() => {
		if (!selectedPlace) {
			return null;
		}
		if (selectedPlace.matchedName) {
			return selectedPlace.matchedName;
		}
		return selectedPlace.name ?? null;
	});

	const search = createPlaceSearch();

	const options = $derived(
		search.matches.map((m) => {
			let detail = translate(m.type);
			const period = formatPlaceWindow(m);
			if (period) {
				detail = `${detail} · ${period}`;
			}
			return {
				value: m.placeId,
				label: m.matchedName,
				detail
			};
		})
	);

	function handleSelect(placeId: string) {
		const match = search.matches.find((m) => m.placeId === placeId);
		if (match && onSelect) {
			onSelect(match);
		}
	}
</script>

<Combobox
	{options}
	onInput={search.setQuery}
	onSelect={handleSelect}
	resetValueOnSelect={true}
	{selectedLabel}
	placeholder={translate('searchPlaceholder')}
	aria-label={translate('searchPlaceholder')}
/>
