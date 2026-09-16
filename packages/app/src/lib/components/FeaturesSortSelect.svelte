<script lang="ts" module>
	export { UI_SORT_MODES, type UiSortMode } from '$utils/sort-modes';
</script>

<script lang="ts">
	import Select, { type SelectOption } from '$components/Select.svelte';
	import Button from '$components/Button.svelte';
	import ArrowsClockwise from 'phosphor-svelte/lib/ArrowsClockwise';
	import { translate } from '$utils/translations';
	import type { UiSortMode } from '$utils/sort-modes';

	type Props = {
		value: UiSortMode;
		onChange: (mode: UiSortMode) => void;
		onShuffle: () => void;
		// a text search is active: offer bestMatch (rank by match quality)
		searchActive?: boolean;
	};
	let { value, onChange, onShuffle, searchActive = false }: Props = $props();

	const OPTIONS: SelectOption<UiSortMode>[] = [
		{ value: 'sample', label: translate('sortSample') },
		{ value: 'spatial', label: translate('sortSpatial') },
		{ value: 'temporal', label: translate('sortTemporal') },
		{ value: 'relevance', label: translate('sortRelevance') },
		{ value: 'oldest', label: translate('sortOldest') },
		{ value: 'newest', label: translate('sortNewest') }
	];

	// also offered while it IS the value (a URL can carry sort=bestMatch without a
	// search), so the select never holds a value it can't display
	const options = $derived.by(() => {
		if (searchActive || value === 'bestMatch') {
			return [{ value: 'bestMatch' as UiSortMode, label: translate('sortBestMatch') }, ...OPTIONS];
		}
		return OPTIONS;
	});
</script>

<div class="flex items-center gap-2">
	<span class="text-base text-gray-700">{translate('sortLabel')}</span>
	<Select {options} {value} {onChange} aria-label={translate('sortLabel')} />
	{#if value === 'sample'}
		<Button icon={ArrowsClockwise} onclick={onShuffle} size={16} aria-label={translate('reshuffle')} />
	{/if}
</div>
