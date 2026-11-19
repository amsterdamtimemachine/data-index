<!-- A picture's content: the image, and its description under it when the source gives one. -->
<script lang="ts">
	import type { FeatureResult } from '@atm/shared/types';
	import FeatureCardImage from '#lib/components/FeatureCardImage.svelte';
	import FeatureCardText from '#lib/components/FeatureCardText.svelte';
	import { getPictureUrl, pictureUse } from '#lib/utils/image-sizes.js';

	type Props = {
		feature: FeatureResult;
		expanded?: boolean;
		onExpand?: () => void;
	};
	let { feature, expanded = false, onExpand }: Props = $props();
</script>

{#if feature.contentUrl}
	<FeatureCardImage thumbnail={getPictureUrl(feature.contentUrl, pictureUse(expanded))} alt={feature.description} {expanded} {onExpand} />
{/if}
{#if feature.description}
	<FeatureCardText text={feature.description} {expanded} />
{/if}
