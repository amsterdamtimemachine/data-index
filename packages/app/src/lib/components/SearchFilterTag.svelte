<script lang="ts">
	import Tag from '$components/Tag.svelte';
	import Button from '$components/Button.svelte';
	import X from 'phosphor-svelte/lib/X';
	import MagnifyingGlass from 'phosphor-svelte/lib/MagnifyingGlass';
	import { translate } from '$utils/translations';

	type Props = {
		query: string;
		onClear: () => void;
		// apply/pause the search filter (the chip itself is the toggle)
		onToggle?: () => void;
		// the search is applied: chip shows as an active filter tag
		active?: boolean;
	};
	let { query, onClear, onToggle, active = false }: Props = $props();

	const toggleLabel = $derived.by(() => {
		if (active) {
			return `${translate('pauseSearchTerm')} ${query}`;
		}
		return `${translate('resumeSearchTerm')} ${query}`;
	});
	const variant = $derived.by(() => {
		if (active) {
			return 'selected-outline' as const;
		}
		return 'outline' as const;
	});
</script>

{#snippet chipContent()}
	<span class="inline-flex align-[-2px] mr-1"><MagnifyingGlass size={14} weight="bold" /></span>{query}
{/snippet}

<div class="flex items-center gap-2">
	<Button icon={X} onclick={onClear} size={18} aria-label={translate('clearSearchFilter')} class="shrink-0" />
	<Tag {variant} interactive={true}>
		{#if onToggle}
			<button onclick={onToggle} aria-label={toggleLabel} title={toggleLabel} aria-pressed={active} class="text-left cursor-pointer">{@render chipContent()}</button>
		{:else}
			<span class="text-left">{@render chipContent()}</span>
		{/if}
	</Tag>
</div>
