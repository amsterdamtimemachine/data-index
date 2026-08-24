<script lang="ts">
	import Combobox from '$components/Combobox.svelte';
	import { createPlaceSearch } from '$lib/state/place-search.svelte';
	import { translate } from '$utils/translations';
	import type { PlaceSearchMatch } from '@atm/shared/types';

	type Props = {
		onSelect?: (match: PlaceSearchMatch) => void;
	};
	let { onSelect }: Props = $props();

	const search = createPlaceSearch();

	function windowLabel(match: PlaceSearchMatch): string {
		let window = match.matchedWindow;
		if (!window) {
			window = match.geometryWindow;
		}
		if (!window) {
			return '';
		}
		const [since, until] = window;
		if (since && until) {
			return `${since.slice(0, 4)}–${until.slice(0, 4)}`;
		}
		if (until) {
			return `tot ${until.slice(0, 4)}`;
		}
		if (since) {
			return `vanaf ${since.slice(0, 4)}`;
		}
		return '';
	}

	const options = $derived(
		search.matches.map((m) => {
			let detail = translate(m.type);
			const period = windowLabel(m);
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
	placeholder={translate('searchPlaceholder')}
	aria-label={translate('searchPlaceholder')}
/>
