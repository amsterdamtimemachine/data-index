<script lang="ts" module>
	export type UiSortMode = 'sample' | 'spatial' | 'oldest' | 'newest';
	export const UI_SORT_MODES: UiSortMode[] = ['sample', 'spatial', 'oldest', 'newest'];
</script>

<script lang="ts">
	import Select, { type SelectOption } from '$components/Select.svelte';
	import Button from '$components/Button.svelte';
	import ArrowsClockwise from 'phosphor-svelte/lib/ArrowsClockwise';
	import { translate } from '$utils/translations';

	type Props = {
		value: UiSortMode;
		onChange: (mode: UiSortMode) => void;
		onShuffle: () => void;
	};
	let { value, onChange, onShuffle }: Props = $props();

	const OPTIONS: SelectOption<UiSortMode>[] = [
		{ value: 'sample', label: translate('sortSample') },
		{ value: 'spatial', label: translate('sortSpatial') },
		{ value: 'oldest', label: translate('sortOldest') },
		{ value: 'newest', label: translate('sortNewest') }
	];
</script>

<div class="flex items-center gap-2">
	<span class="text-base text-gray-700">{translate('sortLabel')}</span>
	<Select options={OPTIONS} {value} {onChange} aria-label={translate('sortLabel')} />
	{#if value === 'sample'}
		<Button icon={ArrowsClockwise} onclick={onShuffle} size={16} aria-label={translate('reshuffle')} />
	{/if}
</div>
