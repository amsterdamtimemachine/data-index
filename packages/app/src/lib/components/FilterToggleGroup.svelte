<!-- The filter panel's choice list: outline tags that toggle, one of them required unless told otherwise; items are ids shown by their label, and with counts each shows what pressing it leaves -->
<script lang="ts">
	import Check from 'phosphor-svelte/lib/Check';
	import Tag from './Tag.svelte';
	import { ToggleGroup } from '#lib/builders/toggle-group.js';

	interface Props {
		// ids; the selection and the counts speak in them
		items: string[];
		selectedItems: string[];
		// the text an id shows as
		label: (id: string) => string;
		// what each item is worth under the other filters, by id; absent while loading
		counts?: Map<string, number>;
		onItemSelected: (selected: string[]) => void;
		requireOne?: boolean;
		// the id of the heading that names this group
		labelledBy: string;
	}

	let {
		items,
		selectedItems,
		label,
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

	const sortedItems = $derived(
		items.map((id) => ({ id, text: label(id) })).sort((a, b) => a.text.localeCompare(b.text))
	);
</script>

<div {...group.root} class="flex flex-col items-start gap-1">
	{#each sortedItems as { id, text } (id)}
		{@const selected = selectedItems.includes(id)}
		{@const count = counts?.get(id)}
		<button
			{...group.item(id, false)}
			aria-label={text}
			title={text}
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
				<Tag variant="selected-outline" interactive={true}>{text}</Tag>
			{:else}
				<Tag variant="outline" interactive={true}>{text}</Tag>
			{/if}
			{#if count !== undefined}
				<span class="text-sm text-gray-500 tabular-nums">{count}</span>
			{/if}
		</button>
	{/each}
</div>
