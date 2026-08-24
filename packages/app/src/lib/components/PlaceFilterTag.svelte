<script lang="ts">
	import Tag from '$components/Tag.svelte';
	import Button from '$components/Button.svelte';
	import X from 'phosphor-svelte/lib/X';
	import { translate } from '$utils/translations';
	import { formatPlaceWindow } from '$utils/format';
	import type { PlaceSearchMatch } from '@atm/shared/types';

	type Props = {
		place: PlaceSearchMatch;
		onClear: () => void;
	};
	let { place, onClear }: Props = $props();

	const displayName = $derived.by(() => {
		if (place.matchedName) {
			return place.matchedName;
		}
		if (place.name) {
			return place.name;
		}
		return place.placeId;
	});
	const period = $derived(formatPlaceWindow(place));
</script>

<div class="flex items-center gap-2">
	<Button icon={X} onclick={onClear} size={14} aria-label={translate('clearPlaceFilter')} />
	<!-- same color and square corners as the place outline on the map -->
	<Tag
		variant="outline"
		class="border-2 border-map-place-outline rounded-none bg-atm-sand inline-flex items-center gap-1.5 px-2"
	>
		<span>{translate('cellsOf')} {displayName}</span>
		{#if period}
			<span class="text-gray-700">· {period}</span>
		{/if}
	</Tag>
</div>
