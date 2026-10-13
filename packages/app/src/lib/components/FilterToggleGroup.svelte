<!-- The filter panel's choice list: outline tags that toggle, one of them required unless told otherwise -->
<script lang="ts">
	import ToggleGroup from './ToggleGroup.svelte';
	import Tag from './Tag.svelte';

	interface Props {
		items: string[];
		selectedItems: string[];
		disabledItems?: string[];
		onItemSelected: (selected: string[] | string) => void;
		requireOne?: boolean;
	}

	let { items, selectedItems, disabledItems = [], onItemSelected, requireOne = true }: Props = $props();
</script>

<ToggleGroup {items} {selectedItems} {disabledItems} {onItemSelected} requireOneItemSelected={requireOne}>
	{#snippet children(item, isSelected, isDisabled)}
		{#if isSelected}
			<Tag variant="selected-outline" disabled={isDisabled} interactive={true}>{item}</Tag>
		{:else}
			<Tag variant="outline" disabled={isDisabled} interactive={true}>{item}</Tag>
		{/if}
	{/snippet}
</ToggleGroup>
