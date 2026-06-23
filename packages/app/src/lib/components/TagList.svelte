<script lang="ts">
	import { mergeCss } from '$utils/utils';
	import Tag from '$components/Tag.svelte';

	interface Props {
		tags: string[];
		class?: string;
		maxVisible?: number;
		expanded?: boolean;
	}

	let { tags, class: className, maxVisible = 2, expanded = false }: Props = $props();

	const visibleTags = $derived(expanded ? tags : tags.slice(0, maxVisible));
	const hiddenCount = $derived(tags.length - maxVisible);
	const showOverflow = $derived(!expanded && hiddenCount > 0);
</script>

{#if tags && tags.length > 0}
	<div class={mergeCss('flex flex-wrap gap-1', className)}>
		{#each visibleTags as tag}
			<Tag>{tag}</Tag>
		{/each}
		{#if showOverflow}
			<Tag>+{hiddenCount}</Tag>
		{/if}
	</div>
{/if}
