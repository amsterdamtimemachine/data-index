<!--
	A story's content: the excerpt at the place the card is shown at, whole when
	expanded, a window collapsed, with the page's drawings where they sit in the text.
	Without a search the place's mentions are in bold and the window sits around the
	first; with one, only the search's matches are marked and the window sits around
	the first, or the text opens from its start when nothing in it matched. Without an
	excerpt, the description.
-->
<script lang="ts">
	import type { FeatureResult } from '@atm/shared/types';
	import FeatureCardExcerpt from '#lib/components/FeatureCardExcerpt.svelte';
	import FeatureCardText from '#lib/components/FeatureCardText.svelte';
	import { pickExcerpt, excerptWindow, excerptBlocks, precedingImage, windowOffset, TEXT_WINDOWS } from '#lib/utils/excerpts.js';
	import { excerptSearchRanges, hasSearchHits, shiftRanges } from '#lib/utils/search-hits.js';

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
	const searching = $derived(hasSearchHits(feature));
	// the search's matches on the whole text
	const searchRanges = $derived.by(() => {
		if (!searching || !whole) {
			return [];
		}
		return excerptSearchRanges(feature, whole);
	});
	const excerpt = $derived.by(() => {
		if (!whole) {
			return null;
		}
		if (expanded) {
			return whole;
		}
		if (!searching) {
			return excerptWindow(whole);
		}
		return excerptWindow(whole, TEXT_WINDOWS.excerpt, searchRanges[0] ?? { start: 0, end: 0 });
	});
	// what the shown text marks: the place's mentions, or the search's matches moved onto it
	const marks = $derived.by(() => {
		if (!whole || !excerpt) {
			return [];
		}
		if (!searching) {
			return excerpt.mentions;
		}
		return shiftRanges(searchRanges, windowOffset(whole, excerpt), excerpt.text.length);
	});
	// the excerpt's images sit in the text where they are on the page: every one expanded,
	// collapsed only the one just before the text, so the text stays under it
	const blocks = $derived.by(() => {
		if (!excerpt) {
			return [];
		}
		if (expanded) {
			return excerptBlocks(excerpt, marks);
		}
		const image = precedingImage(excerpt);
		return excerptBlocks({ ...excerpt, images: image ? [image] : [] }, marks);
	});
</script>

{#if excerpt}
	<FeatureCardExcerpt {blocks} truncatedBefore={excerpt.truncatedBefore} truncatedAfter={excerpt.truncatedAfter} sourceUrl={feature.url} {expanded} {searching} {onExpand} />
{:else if feature.description}
	<FeatureCardText text={feature.description} {expanded} />
{/if}
