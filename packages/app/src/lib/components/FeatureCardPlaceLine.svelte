<!--
	The line under the title: the type, then how the item relates to its place, the
	place linked to its record; in the evidence colour when the card's text names it.
-->
<script lang="ts">
	import Link from '#lib/components/Link.svelte';
	import EvidenceHighlight from '#lib/components/EvidenceHighlight.svelte';
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
	{line.type}{#if line.relation || line.place}{' • '}{/if}{#if line.relation}{line.relation}{' '}{/if}{#if line.place}{#if line.evidence}<EvidenceHighlight href={line.placeHref}>{line.place}{line.now ?? ''}</EvidenceHighlight>{:else if line.placeHref}<Link href={line.placeHref} target="_blank" rel="noopener noreferrer" class="inline text-gray-500">{line.place}{line.now ?? ''}</Link>{:else}{line.place}{line.now ?? ''}{/if}{/if}{line.date ?? ''}
</p>
