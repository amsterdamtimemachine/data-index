<script lang="ts">
	import Tag from '$components/Tag.svelte';
	import Button from '$components/Button.svelte';
	import X from 'phosphor-svelte/lib/X';
	import { translate } from '$utils/translations';
	import { formatPlaceTitle } from '$utils/format';
	import type { PlaceSearchMatch } from '@atm/shared/types';

	type Props = {
		place: PlaceSearchMatch;
		onClear: () => void;
		// the chip itself shows and hides the place's panel
		onToggle?: () => void;
		// the place is the panel subject: chip shows as an active filter tag
		active?: boolean;
	};
	let { place, onClear, onToggle, active = false }: Props = $props();

	const displayName = $derived(formatPlaceTitle(place));
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
	const toggleLabel = $derived.by(() => {
		if (active) {
			return translate('hidePlaceFeatures');
		}
		return translate('showPlaceFeatures');
	});
</script>

{#snippet chipContent()}
	{`${cellsLabel} ${displayName}`}
{/snippet}

<div class="flex items-center gap-2">
	<Button icon={X} onclick={onClear} size={18} aria-label={translate('clearPlaceFilter')} class="shrink-0" />
	<Tag {variant} interactive={true}>
		{#if onToggle}
			<button onclick={onToggle} aria-label={toggleLabel} aria-pressed={active} class="text-left cursor-pointer">
				{@render chipContent()}
			</button>
		{:else}
			<span class="text-left">
				{@render chipContent()}
			</span>
		{/if}
	</Tag>
</div>
