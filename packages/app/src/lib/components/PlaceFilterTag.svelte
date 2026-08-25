<script lang="ts">
	import Tag from '$components/Tag.svelte';
	import Button from '$components/Button.svelte';
	import X from 'phosphor-svelte/lib/X';
	import { translate } from '$utils/translations';
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

	// while active, the select button previews deactivation in the chrome gold
	const toggleOuterStroke = $derived.by(() => {
		if (active) {
			return 'stroke-atm-gold-darkest-hover';
		}
		return 'stroke-map-selected-outline-casing';
	});
	const toggleInnerStroke = $derived.by(() => {
		if (active) {
			return 'stroke-atm-gold-darkest';
		}
		return 'stroke-atm-red';
	});
</script>

{#snippet chipContent()}
	<!-- inline flow, not flex: a narrow chip wraps like a sentence -->
	<!-- the place's mark on the map: gold square with its darker casing -->
	<svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true" class="inline align-middle mr-1">
		<rect x="4.5" y="4.5" width="9" height="9" fill="none" class="stroke-map-place-outline-casing" stroke-width="5" />
		<rect x="4.5" y="4.5" width="9" height="9" fill="none" class="stroke-map-place-outline" stroke-width="2" />
	</svg><span class="align-middle">{`${cellsLabel} ${displayName}`}</span>
{/snippet}

<div class="flex items-center gap-2">
	<Button icon={X} onclick={onClear} size={18} aria-label={translate('clearPlaceFilter')} class="shrink-0" />
	{#if onToggle}
		<!-- the map's selection mark: red square with its darker casing; gold while
		     active, where clicking deselects -->
		<Button onclick={onToggle} aria-label={translate('viewPlace')} class="p-1 shrink-0">
			<svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
				<rect x="4.5" y="4.5" width="9" height="9" fill="none" class={toggleOuterStroke} stroke-width="5" />
				<rect x="4.5" y="4.5" width="9" height="9" fill="none" class={toggleInnerStroke} stroke-width="2" />
			</svg>
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
