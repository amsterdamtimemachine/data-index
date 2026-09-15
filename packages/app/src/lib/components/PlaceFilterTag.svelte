<script lang="ts">
	import Tag from '$components/Tag.svelte';
	import Button from '$components/Button.svelte';
	import X from 'phosphor-svelte/lib/X';
	import { translate } from '$utils/translations';
	import { asset } from '$app/paths';
	import type { PlaceSearchMatch } from '@atm/shared/types';

	type Props = {
		place: PlaceSearchMatch;
		onClear: () => void;
		// select/deselect the place as the panel subject (red button and chip alike)
		onToggle?: () => void;
		// the place is the panel subject: chip shows as an active filter tag
		active?: boolean;
	};
	let { place, onClear, onToggle, active = false }: Props = $props();

	const displayName = $derived.by(() => {
		if (place.matchedName) {
			return place.matchedName;
		}
		if (place.name) {
			return place.name;
		}
		return place.placeId;
	});
	const cellsLabel = $derived.by(() => {
		if (place.cells.length === 1) {
			return translate('cellOf');
		}
		return translate('cellsOf');
	});

	const variant = $derived.by(() => {
		if (active) {
			return 'selected-outline' as const;
		}
		return 'outline' as const;
	});

	// the button shows the state a press leads to, like the timeline switch
	const toggleGlyph = $derived.by(() => {
		if (active) {
			return asset('/glyphs/UnselectPlaceFeatures.svg');
		}
		return asset('/glyphs/SelectPlaceFeatures.svg');
	});
	const toggleLabel = $derived.by(() => {
		if (active) {
			return translate('unselectPlaceFeatures');
		}
		return translate('selectPlaceFeatures');
	});
</script>

{#snippet chipContent()}
	{`${cellsLabel} ${displayName}`}
{/snippet}

<div class="flex items-center gap-2">
	<Button icon={X} onclick={onClear} size={18} aria-label={translate('clearPlaceFilter')} class="shrink-0" />
	{#if onToggle}
		<Button onclick={onToggle} aria-label={toggleLabel} class="p-1 shrink-0">
			<img src={toggleGlyph} alt="" width="24" height="24" />
		</Button>
	{/if}
	<Tag {variant} interactive={true}>
		{#if onToggle}
			<button onclick={onToggle} class="text-left cursor-pointer">
				{@render chipContent()}
			</button>
		{:else}
			<span class="text-left">
				{@render chipContent()}
			</span>
		{/if}
	</Tag>
</div>
