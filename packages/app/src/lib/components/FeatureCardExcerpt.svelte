<!--
	A story's excerpt: the text around the place it is shown at, with the place's
	mentions marked as the link's evidence and an ellipsis on each cut side, and the
	page's images where they sit in the text. Expanded, a cut excerpt ends with a link
	to the entry's page at the source.
-->
<script lang="ts">
	import Link from '#lib/components/Link.svelte';
	import EvidenceHighlight from '#lib/components/EvidenceHighlight.svelte';
	import ArrowUpRight from 'phosphor-svelte/lib/ArrowUpRight';
	import FeatureCardImage from '#lib/components/FeatureCardImage.svelte';
	import { translate } from '#lib/utils/translations.js';
	import { iiifImageUrl } from '#lib/utils/iiif.js';
	import type { ExcerptBlock } from '#lib/utils/excerpts.js';

	type Props = {
		blocks: ExcerptBlock[];
		truncatedBefore: boolean;
		truncatedAfter: boolean;
		sourceUrl?: string;
		expanded?: boolean;
	};
	let { blocks, truncatedBefore, truncatedAfter, sourceUrl, expanded = false }: Props = $props();

	// the ellipses go on the first and last text, whatever images sit around them
	const firstText = $derived(blocks.findIndex((b) => b.kind === 'text'));
	const lastText = $derived(blocks.findLastIndex((b) => b.kind === 'text'));

	const wrapperClasses = $derived.by(() => {
		// a reading measure: about 75 characters a line on desktop, the full width on a phone
		if (expanded) {
			return 'max-w-[600px]';
		}
		return 'flex-1';
	});
</script>

<div class={wrapperClasses}>
	{#each blocks as block, b (b)}
		{#if block.kind === 'image'}
			<FeatureCardImage thumbnail={iiifImageUrl(block.image)} alt={translate('diaryImage')} expanded={true} />
		{:else}
			<p class="p-2 text-base text-gray-700 leading-relaxed whitespace-pre-wrap">
				{#if truncatedBefore && b === firstText}{'… '}{/if}{#each block.segments as segment, i (i)}{#if segment.marked}<EvidenceHighlight inText={true}>{segment.text}</EvidenceHighlight>{:else}{segment.text}{/if}{/each}{#if truncatedAfter && b === lastText}{' …'}{/if}
			</p>
		{/if}
	{/each}
	{#if expanded && sourceUrl && (truncatedBefore || truncatedAfter)}
		<p class="px-2 pb-2">
			<Link href={sourceUrl} icon={ArrowUpRight} weight="bold" title={translate('fullTextAtSource')}>{translate('readMore')}</Link>
		</p>
	{/if}
</div>
