<!--
	A story's excerpt: the text around the place it is shown at, with the place's
	mentions marked. An ellipsis on a cut side links to the source for the whole text.
-->
<script lang="ts">
	import Link from '$components/Link.svelte';
	import { translate } from '$utils/translations';
	import type { TextSegment } from '$utils/excerpts';

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

{#snippet ellipsis()}
	{#if sourceUrl}
		<Link href={sourceUrl} title={translate('fullTextAtSource')} class="underline">…</Link>
	{:else}
		…
	{/if}
{/snippet}

<div class={wrapperClasses}>
	<p class="p-2 text-base text-gray-700 leading-relaxed whitespace-pre-wrap">
		{#if truncatedBefore}{@render ellipsis()}{' '}{/if}{#each segments as segment, i (i)}{#if segment.marked}<mark class="bg-atm-gold-gray text-inherit rounded-sm">{segment.text}</mark>{:else}{segment.text}{/if}{/each}{#if truncatedAfter}{' '}{@render ellipsis()}{/if}
	</p>
</div>
