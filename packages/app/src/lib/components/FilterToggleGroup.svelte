<!-- The filter panel's choice list: outline tags that toggle, one of them required unless told otherwise; with counts, each shows what pressing it leaves -->
<script lang="ts">
	import Check from 'phosphor-svelte/lib/Check';
	import Tag from './Tag.svelte';
	import { ToggleGroup } from '#lib/builders/toggle-group.js';

	interface Props {
		items: string[];
		selectedItems: string[];
		// what each item is worth under the other filters, by item; absent while loading
		counts?: Map<string, number>;
		onItemSelected: (selected: string[]) => void;
		requireOne?: boolean;
		// the id of the heading that names this group
		labelledBy: string;
	}

	let {
		items,
		selectedItems,
		counts,
		onItemSelected,
		requireOne = true,
		labelledBy
	}: Props = $props();

	const group = new ToggleGroup({
		selected: () => selectedItems,
		onChange: (next) => onItemSelected(next),
		requireOne: () => requireOne,
		labelledBy: () => labelledBy
	});

	const sortedItems = $derived([...items].sort());
</script>

<div {...group.root} class="flex flex-col items-start gap-1">
	{#each sortedItems as item (item)}
		{@const selected = selectedItems.includes(item)}
		{@const count = counts?.get(item)}
		<button
			{...group.item(item, false)}
			aria-label={item}
			title={item}
			class="focus-ring flex items-center gap-2 pb-1 w-full text-left cursor-pointer"
		>
			<span
				class="w-5 h-5 border border-atm-gold rounded flex items-center justify-center bg-atm-sand-darkish hover:bg-atm-sand-dark"
				aria-hidden="true"
			>
				{#if selected}
					<Check size={18} weight="bold" color="black" />
				{/if}
			</span>
			{#if selected}
				<Tag variant="selected-outline" interactive={true}>{item}</Tag>
			{:else}
				<Tag variant="outline" interactive={true}>{item}</Tag>
			{/if}
			{#if count !== undefined}
				<span class="text-sm text-gray-500 tabular-nums">{count}</span>
			{/if}
		</button>
	{/each}
</div>
