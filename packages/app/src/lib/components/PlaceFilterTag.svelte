<script lang="ts">
	import Tag from '#lib/components/Tag.svelte';
	import Button from '#lib/components/Button.svelte';
	import X from 'phosphor-svelte/lib/X';
	import MapPin from 'phosphor-svelte/lib/MapPin';
	import { translate } from '#lib/utils/translations.js';
	import { formatPlaceTitle } from '#lib/utils/format.js';
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
	<span class="inline-flex align-[-2px] mr-1"><MapPin size={14} weight="bold" /></span>{`${cellsLabel} ${displayName}`}
{/snippet}

<div class="flex items-center gap-2">
	<Button icon={X} onclick={onClear} size={18} aria-label={translate('clearPlaceFilter')} class="shrink-0" />
	<Tag {variant} interactive={true}>
		{#if onToggle}
			<button onclick={onToggle} aria-label={toggleLabel} title={toggleLabel} aria-pressed={active} class="text-left cursor-pointer">
				{@render chipContent()}
			</button>
		{:else}
			<span class="text-left">
				{@render chipContent()}
			</span>
		{/if}
	</Tag>
</div>
