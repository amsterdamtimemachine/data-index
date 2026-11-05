<!--
	A story's content: the excerpt at the place the card is shown at, whole when
	expanded, a window collapsed, with the page's drawings where they sit in the text.
	The place's mentions are in bold and the search's matches are marked. Without a
	search the window sits around the first mention; with one, around the first match,
	or the text opens from its start when nothing in it matched, and a mention inside
	the window is still bold. Expanded, the whole text. Without an excerpt, the description.
-->
<script lang="ts">
	import type { FeatureResult } from '@atm/shared/types';
	import FeatureCardExcerpt from '#lib/components/FeatureCardExcerpt.svelte';
	import FeatureCardText from '#lib/components/FeatureCardText.svelte';
	import { pickExcerpt, excerptWindow, excerptBlocks, precedingImage, TEXT_WINDOWS, type ExcerptWindow, type TextMarks } from '#lib/utils/excerpts.js';
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
	// the text shown, and where it starts in the whole
	const shown = $derived.by((): ExcerptWindow | null => {
		if (!whole) {
			return null;
		}
		if (expanded) {
			return { excerpt: whole, offset: 0 };
		}
		if (!searching) {
			return excerptWindow(whole);
		}
		return excerptWindow(whole, TEXT_WINDOWS.excerpt, searchRanges[0] ?? { start: 0, end: 0 });
	});
	// what the shown text marks: the mentions inside it, and the search's matches moved onto it
	const marks = $derived.by((): TextMarks => {
		if (!shown) {
			return {};
		}
		return { place: shown.excerpt.mentions, search: shiftRanges(searchRanges, shown.offset, shown.excerpt.text.length) };
	});
	// the excerpt's images sit in the text where they are on the page: every one expanded,
	// collapsed only the one just before the text, so the text stays under it
	const blocks = $derived.by(() => {
		if (!shown) {
			return [];
		}
		if (expanded) {
			return excerptBlocks(shown.excerpt, marks);
		}
		const image = precedingImage(shown.excerpt);
		return excerptBlocks({ ...shown.excerpt, images: image ? [image] : [] }, marks);
	});
</script>

{#if shown}
	<FeatureCardExcerpt {blocks} truncatedBefore={shown.excerpt.truncatedBefore} truncatedAfter={shown.excerpt.truncatedAfter} sourceUrl={feature.url} {expanded} {onExpand} />
{:else if feature.description}
	<FeatureCardText text={feature.description} {expanded} />
{/if}
