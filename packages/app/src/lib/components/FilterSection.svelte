<!--
	A labelled filter: heading + tooltip over a single-choice-required toggle group of
	tags. The three map filters (record type, dataset, geometry) are all this shape.
-->
<script lang="ts">
	import QuestionMark from 'phosphor-svelte/lib/QuestionMark';
	import Heading from './Heading.svelte';
	import Tooltip from './Tooltip.svelte';
	import ToggleGroup from './ToggleGroup.svelte';
	import Tag from './Tag.svelte';

	interface Props {
		heading: string;
		tooltip: string;
		items: string[];
		selectedItems: string[];
		onItemSelected: (selected: string[] | string) => void;
		requireOne?: boolean;
	}

	let { heading, tooltip, items, selectedItems, onItemSelected, requireOne = true }: Props = $props();
</script>

<div class="mb-4">
	<div class="flex mb-2">
		<Heading level={3} class="pr-2">{heading}</Heading>
		<Tooltip icon={QuestionMark} text={tooltip} placement="bottom" />
	</div>
	<ToggleGroup {items} {selectedItems} {onItemSelected} requireOneItemSelected={requireOne}>
		{#snippet children(item, isSelected, isDisabled)}
			<Tag variant={isSelected ? 'selected-outline' : 'outline'} disabled={isDisabled} interactive={true}>
				{item}
			</Tag>
		{/snippet}
	</ToggleGroup>
</div>
