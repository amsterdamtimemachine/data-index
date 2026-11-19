<!--
	A card's content, by the kind its entity type maps to (contentKind): a picture, a
	programme, a story, or the description alone. The card renders this and never
	needs to know which.
-->
<script lang="ts">
	import type { FeatureResult } from '@atm/shared/types';
	import { contentKind } from '#lib/utils/cardFields.js';
	import FeatureCardPicture from '#lib/components/FeatureCardPicture.svelte';
	import FeatureCardProgramme from '#lib/components/FeatureCardProgramme.svelte';
	import FeatureCardStory from '#lib/components/FeatureCardStory.svelte';
	import FeatureCardDescription from '#lib/components/FeatureCardDescription.svelte';

	type Props = {
		feature: FeatureResult;
		expanded?: boolean;
		onExpand?: () => void;
	};
	let { feature, expanded = false, onExpand }: Props = $props();

	const kind = $derived(contentKind(feature.entity));
</script>

{#if kind === 'picture'}
	<FeatureCardPicture {feature} {expanded} {onExpand} />
{:else if kind === 'programme'}
	<FeatureCardProgramme {feature} {expanded} />
{:else if kind === 'story'}
	<FeatureCardStory {feature} {expanded} {onExpand} />
{:else}
	<FeatureCardDescription {feature} {expanded} />
{/if}
