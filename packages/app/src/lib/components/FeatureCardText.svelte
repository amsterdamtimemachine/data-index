<script lang="ts">
	import { translate } from '#lib/utils/translations.js';
	import { parseMarks, markText } from '#lib/utils/search-hits.js';
	import MarkedText from '#lib/components/MarkedText.svelte';
	import Link from '#lib/components/Link.svelte';
	import { TEXT_WINDOWS } from '#lib/config/text.js';
	type Props = {
		text: string;
		expanded?: boolean;
	};

	let { text, expanded = false }: Props = $props();

	let showFullText = $state(false);
	// the length is the words', not the search marks' in them
	const parsed = $derived(parseMarks(text));
	const needsTruncation = $derived(parsed.text.length > TEXT_WINDOWS.description);
	const truncatedText = $derived.by(() => {
		if (!needsTruncation) {
			return text;
		}
		return markText(parsed.text.slice(0, TEXT_WINDOWS.description), parsed.ranges) + '...';
	});
</script>

{#if expanded}
	<!-- a reading measure: about 75 characters a line on desktop, the full width on a phone -->
	<div class="max-w-[600px]">
		<p class="p-2 text-gray-700 leading-relaxed whitespace-pre-wrap">
			<MarkedText {text} />
		</p>
	</div>
{:else}
	<div class="flex-1">
		<div class="text-base text-gray-700 leading-relaxed">
			{#if needsTruncation && !showFullText}
				<div>
					<MarkedText text={truncatedText} />
				</div>
				<Link class="mt-2" onclick={() => (showFullText = true)}>{translate('showMore')}</Link>
			{:else}
				<div>
					<MarkedText {text} />
				</div>
				{#if needsTruncation}
					<Link class="mt-2" onclick={() => (showFullText = false)}>{translate('showLess')}</Link>
				{/if}
			{/if}
		</div>
	</div>
{/if}
