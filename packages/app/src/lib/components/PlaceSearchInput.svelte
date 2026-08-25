<script lang="ts">
	import Combobox from '$components/Combobox.svelte';
	import { createPlaceSearch } from '$lib/state/place-search.svelte';
	import { translate } from '$utils/translations';
	import { formatPlaceWindow } from '$utils/format';
	import type { PlaceSearchMatch } from '@atm/shared/types';

	type Props = {
		onSelect?: (match: PlaceSearchMatch) => void;
	};
	let { onSelect }: Props = $props();

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
	clearOnSelect={true}
	placeholder={translate('searchPlaceholder')}
	aria-label={translate('searchPlaceholder')}
/>
