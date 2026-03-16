<script lang="ts">
	import type { FeatureResult } from '@atm/shared/types';
	import { featureViewerState } from '$lib/state/featureState.svelte';
	import FeatureCardHeader from '$components/FeatureCardHeader.svelte';
	import FeatureCardFooter from '$components/FeatureCardFooter.svelte';
	import FeatureCardImage from '$components/FeatureCardImage.svelte';
	import FeatureCardText from '$components/FeatureCardText.svelte';
	import TagList from '$components/TagList.svelte';
	import Heading from '$components/Heading.svelte';

	type Props = {
		feature: FeatureResult;
		expanded?: boolean;
	};

	let { feature, expanded = false }: Props = $props();

	// Feature flag to disable tags for launch
	const SHOW_TAGS = false;

	function handleExpand() {
		featureViewerState.openFeature(feature);
	}
</script>

<div class="w-full border rounded-sm border-atm-sand-border bg-atm-sand min-w-0">
	<FeatureCardHeader class="p-2" {feature} />
	<div class={expanded ? '' : 'p-2'}>
		<Heading
		level={3}
			class={expanded
				? 'font-medium text-xl my-3 px-2'
				: 'font-medium text-lg line-clamp-2 mb-1'}
		>
			{feature.label}
		</Heading>
		<!-- Feature-specific content -->
		{#if feature.recordType === 'image' && feature.contentUrl}
			<FeatureCardImage
				thumbnail={feature.contentUrl}
				alt={feature.description}
				{expanded}
				onExpand={handleExpand}
			/>
		{:else if (feature.recordType === 'text' || feature.recordType === 'person') && feature.description}
			<FeatureCardText text={feature.description} {expanded} />
		{:else}
			<div class="{expanded ? 'px-2' : ''} text-gray-800 text-sm">
				Unknown feature type: {feature.recordType}
			</div>
		{/if}

		<!-- Tags - Temporarily disabled for launch -->
		{#if SHOW_TAGS}
			<TagList
				tags={feature.tags || []}
				{expanded}
				maxVisible={expanded ? undefined : 2}
				class={expanded ? 'py-2 px-2' : 'pt-2'}
			/>
		{/if}
	</div>
	<FeatureCardFooter {feature} onExpand={handleExpand} {expanded} />
</div>
