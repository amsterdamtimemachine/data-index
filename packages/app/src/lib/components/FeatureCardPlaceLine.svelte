<!--
	The line under the title: the type, then how the item relates to its place, the
	place linked to its record.
-->
<script lang="ts">
	import Link from '#lib/components/Link.svelte';
	import type { RelationLine } from '#lib/utils/cardFields.js';

	type Props = {
		line: RelationLine;
		expanded?: boolean;
	};
	let { line, expanded = false }: Props = $props();

	const classes = $derived.by(() => {
		if (expanded) {
			return 'italic text-gray-500 px-2 mb-2 text-base';
		}
		return 'italic text-gray-500 mb-1 text-base';
	});
</script>

<p class={classes}>
	<!-- eslint-disable-next-line svelte/no-useless-mustaches -- the mustaches keep the spaces around the separator -->
	{line.type}{#if line.relation || line.place}{' • '}{/if}{#if line.relation}{line.relation}{' '}{/if}{#if line.place}{#if line.placeHref}<Link href={line.placeHref} target="_blank" rel="noopener noreferrer" class="inline text-gray-500">{line.place}{line.now ?? ''}</Link>{:else}{line.place}{line.now ?? ''}{/if}{/if}{line.date ?? ''}
</p>
