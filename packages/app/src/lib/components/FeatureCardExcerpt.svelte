<!--
	A story's excerpt: the text around the place it is shown at, its mentions in bold,
	or around a search match, marked, or whole with both, with an ellipsis on each cut
	side, and the page's images where they sit in the text. Expanded, a cut excerpt ends with a link
	to the entry's page at the source.
-->
<script lang="ts">
	import Link from '#lib/components/Link.svelte';
	import Mark from '#lib/components/Mark.svelte';
	import ArrowUpRight from 'phosphor-svelte/lib/ArrowUpRight';
	import FeatureCardImage from '#lib/components/FeatureCardImage.svelte';
	import { translate } from '#lib/utils/translations.js';
	import { getExcerptImageUrl, pictureUse } from '#lib/utils/image-sizes.js';
	import type { ExcerptBlock } from '#lib/utils/excerpts.js';

	type Props = {
		blocks: ExcerptBlock[];
		truncatedBefore: boolean;
		truncatedAfter: boolean;
		sourceUrl?: string;
		expanded?: boolean;
		onExpand?: () => void;
	};
	let {
		blocks,
		truncatedBefore,
		truncatedAfter,
		sourceUrl,
		expanded = false,
		onExpand
	}: Props = $props();

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
			<FeatureCardImage
				thumbnail={getExcerptImageUrl(block.image, pictureUse(expanded))}
				alt={translate('diaryImage')}
				{expanded}
				inline={expanded}
				{onExpand}
			/>
		{:else}
			<p class="p-2 text-base text-gray-700 leading-relaxed whitespace-pre-wrap">
				<!-- eslint-disable svelte/no-useless-mustaches -- the mustaches keep the space beside the ellipsis -->
				{#if truncatedBefore && b === firstText}{'… '}{/if}{#each block.segments as segment, i (i)}{#if segment.search}<Mark
							>{#if segment.place}<b class="font-semibold">{segment.text}</b
								>{:else}{segment.text}{/if}</Mark
						>{:else if segment.place}<b class="font-semibold">{segment.text}</b
						>{:else}{segment.text}{/if}{/each}{#if truncatedAfter && b === lastText}{' …'}{/if}
			</p>
			<!-- eslint-enable svelte/no-useless-mustaches -->
		{/if}
	{/each}
	{#if expanded && sourceUrl && (truncatedBefore || truncatedAfter)}
		<p class="px-2 pb-2">
			<Link href={sourceUrl} icon={ArrowUpRight} weight="bold" title={translate('fullTextAtSource')}
				>{translate('readMore')}</Link
			>
		</p>
	{/if}
</div>
