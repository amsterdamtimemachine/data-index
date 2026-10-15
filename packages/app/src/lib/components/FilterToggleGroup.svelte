<!-- The filter panel's choice list: outline tags that toggle, one of them required unless told otherwise -->
<script lang="ts">
	import Check from 'phosphor-svelte/lib/Check';
	import Tag from './Tag.svelte';
	import { ToggleGroup } from '$lib/builders/toggle-group';

	interface Props {
		items: string[];
		selectedItems: string[];
		disabledItems?: string[];
		onItemSelected: (selected: string[]) => void;
		requireOne?: boolean;
		// the id of the heading that names this group
		labelledBy: string;
	}

	let { items, selectedItems, disabledItems = [], onItemSelected, requireOne = true, labelledBy }: Props = $props();

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
		{@const disabled = disabledItems.includes(item)}
		{@const selected = selectedItems.includes(item)}
		<button
			{...group.item(item, disabled)}
			aria-label={item}
			class="focus-ring flex items-center gap-2 pb-1 w-full text-left cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
		>
			<span
				class="w-5 h-5 border border-atm-gold rounded flex items-center justify-center bg-atm-sand-darkish hover:bg-atm-sand-dark"
				class:border-gray-500={disabled}
				aria-hidden="true"
			>
				{#if selected}
					<Check size={18} weight="bold" color="black" />
				{/if}
			</span>
			{#if selected}
				<Tag variant="selected-outline" {disabled} interactive={true}>{item}</Tag>
			{:else}
				<Tag variant="outline" {disabled} interactive={true}>{item}</Tag>
			{/if}
		</button>
	{/each}
</div>
