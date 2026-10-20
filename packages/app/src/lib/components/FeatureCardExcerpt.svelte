<!--
	A story's excerpt: the text around the place it is shown at, with the place's
	mentions marked as the link's evidence and an ellipsis on each cut side. Expanded, a cut excerpt ends with
	a link to the entry's page at the source.
-->
<script lang="ts">
	import Link from '#lib/components/Link.svelte';
	import EvidenceHighlight from '#lib/components/EvidenceHighlight.svelte';
	import ArrowUpRight from 'phosphor-svelte/lib/ArrowUpRight';
	import { translate } from '#lib/utils/translations.js';
	import type { TextSegment } from '#lib/utils/excerpts.js';

	type Props = {
		segments: TextSegment[];
		truncatedBefore: boolean;
		truncatedAfter: boolean;
		sourceUrl?: string;
		expanded?: boolean;
	};
	let { segments, truncatedBefore, truncatedAfter, sourceUrl, expanded = false }: Props = $props();

	const wrapperClasses = $derived.by(() => {
		// a reading measure: about 75 characters a line on desktop, the full width on a phone
		if (expanded) {
			return 'max-w-[600px]';
		}
		return 'flex-1';
	});
</script>

<div class={wrapperClasses}>
	<p class="p-2 text-base text-gray-700 leading-relaxed whitespace-pre-wrap">
		{#if truncatedBefore}{'… '}{/if}{#each segments as segment, i (i)}{#if segment.marked}<EvidenceHighlight inText={true}>{segment.text}</EvidenceHighlight>{:else}{segment.text}{/if}{/each}{#if truncatedAfter}{' …'}{/if}
	</p>
	{#if expanded && sourceUrl && (truncatedBefore || truncatedAfter)}
		<p class="px-2 pb-2">
			<Link href={sourceUrl} icon={ArrowUpRight} weight="bold" title={translate('fullTextAtSource')}>{translate('readMore')}</Link>
		</p>
	{/if}
</div>
