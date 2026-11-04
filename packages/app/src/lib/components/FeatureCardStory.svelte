<!--
	A story's content: the excerpt at the place the card is shown at, whole when
	expanded, a window around the first mention collapsed, with the page's drawings
	where they sit in the text. Without an excerpt, the description.
-->
<script lang="ts">
	import type { FeatureResult } from '@atm/shared/types';
	import FeatureCardExcerpt from '#lib/components/FeatureCardExcerpt.svelte';
	import FeatureCardText from '#lib/components/FeatureCardText.svelte';
	import { pickExcerpt, excerptWindow, excerptBlocks, precedingImage, windowOffset } from '#lib/utils/excerpts.js';
	import { excerptSearchRanges, shiftRanges } from '#lib/utils/search-hits.js';

	type Props = {
		feature: FeatureResult;
		expanded?: boolean;
		onExpand?: () => void;
	};
	let { feature, expanded = false, onExpand }: Props = $props();

	const whole = $derived.by(() => {
		if (feature.entity?.type !== 'Manuscript') {
			return null;
		}
		return pickExcerpt(feature.entity, feature.placeId);
	});
	const excerpt = $derived.by(() => {
		if (!whole) {
			return null;
		}
		if (expanded) {
			return whole;
		}
		return excerptWindow(whole);
	});
	// the words a search matched, as ranges on the text shown
	const searchRanges = $derived.by(() => {
		if (!whole || !excerpt) {
			return [];
		}
		return shiftRanges(excerptSearchRanges(feature, whole), windowOffset(whole, excerpt), excerpt.text.length);
	});
	// the excerpt's images sit in the text where they are on the page: every one expanded,
	// collapsed only the one just before the text, so the text stays under it
	const blocks = $derived.by(() => {
		if (!excerpt) {
			return [];
		}
		if (expanded) {
			return excerptBlocks(excerpt, searchRanges);
		}
		const image = precedingImage(excerpt);
		return excerptBlocks({ ...excerpt, images: image ? [image] : [] }, searchRanges);
	});
</script>

{#if excerpt}
	<FeatureCardExcerpt {blocks} truncatedBefore={excerpt.truncatedBefore} truncatedAfter={excerpt.truncatedAfter} sourceUrl={feature.url} {expanded} {onExpand} />
{:else if feature.description}
	<FeatureCardText text={feature.description} {expanded} />
{/if}
