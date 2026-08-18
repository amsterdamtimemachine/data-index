<script lang="ts" module>
	export type UiSortMode = 'sample' | 'spatial' | 'oldest' | 'newest';
	export const UI_SORT_MODES: UiSortMode[] = ['sample', 'spatial', 'oldest', 'newest'];
</script>

<script lang="ts">
	import Select, { type SelectOption } from '$components/Select.svelte';
	import Button from '$components/Button.svelte';
	import ArrowsClockwise from 'phosphor-svelte/lib/ArrowsClockwise';

	type Props = {
		value: UiSortMode;
		onChange: (mode: UiSortMode) => void;
		onShuffle: () => void;
	};
	let { value, onChange, onShuffle }: Props = $props();

	const OPTIONS: SelectOption<UiSortMode>[] = [
		{ value: 'sample', label: 'Van alles wat' },
		{ value: 'spatial', label: 'Over deze plek' },
		{ value: 'oldest', label: 'Oudste eerst' },
		{ value: 'newest', label: 'Nieuwste eerst' }
	];
</script>

<div class="flex items-center gap-2">
	<Select options={OPTIONS} {value} {onChange} aria-label="Sortering" />
	{#if value === 'sample'}
		<Button icon={ArrowsClockwise} onclick={onShuffle} size={16} aria-label="Schud opnieuw" />
	{/if}
</div>
