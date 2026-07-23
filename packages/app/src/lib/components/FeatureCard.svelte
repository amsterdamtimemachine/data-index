<script lang="ts">
	import type { FeatureResult } from '@atm/shared/types';
	import { translate } from '$utils/translations';
	import { resolveCardFields, dataSourceFields } from '$utils/cardFields';
	import { featureViewerState } from '$lib/state/featureState.svelte';
	import FeatureCardHeader from '$components/FeatureCardHeader.svelte';
	import FeatureCardImage from '$components/FeatureCardImage.svelte';
	import FeatureCardText from '$components/FeatureCardText.svelte';
	import FieldList from '$components/FieldList.svelte';
	import TagList from '$components/TagList.svelte';
	import Heading from '$components/Heading.svelte';

	type Props = {
		feature: FeatureResult;
		expanded?: boolean;
	};

	let { feature, expanded = false }: Props = $props();

	const entityFields = $derived(feature.entity ? resolveCardFields(feature.entity, expanded) : []);
	const sourceFields = $derived(dataSourceFields(feature, expanded));

	// Feature flag to disable tags for launch
	const SHOW_TAGS = false;

	function handleExpand() {
		featureViewerState.openFeature(feature);
	}
</script>

<div class="w-full border rounded-sm border-atm-sand-border bg-atm-sand min-w-0">
	<FeatureCardHeader class="p-2" {feature} {expanded} onExpand={handleExpand} />
	<div class={expanded ? '' : 'p-2'}>
		<Heading
		level={3}
			class={expanded
				? 'font-medium text-xl my-3 px-2'
				: 'font-medium text-lg line-clamp-2 mb-0'}
		>
			{feature.label}
		</Heading>
		{#if feature.relationId || feature.displayName || feature.historicalLabel}
			{@const placeName = feature.historicalLabel || feature.displayName}
			{@const showBoth = feature.historicalLabel && feature.displayName && feature.historicalLabel !== feature.displayName}
			<p class="italic text-gray-500 {expanded ? 'px-2 mb-2' : 'mb-1'} text-base">
				{feature.relationId ? translate(feature.relationId) : ''}{placeName ? ` ${placeName}` : ''}{showBoth ? ` (nu ${feature.displayName})` : ''}
			</p>
		{/if}
		<!-- Feature-specific content -->
		{#if feature.recordType === 'image' && feature.contentUrl}
			<FeatureCardImage
				thumbnail={feature.contentUrl}
				alt={feature.description}
				{expanded}
				onExpand={handleExpand}
			/>
		{/if}
		{#if feature.description}
			<FeatureCardText text={feature.description} {expanded} />
		{/if}
		<!-- Entity fields (born/died, date/author). Collapsed keeps the summary fields;
		     detail shows them all — same label:value layout either way. -->
		<FieldList fields={entityFields} class={expanded ? 'px-2 py-2' : 'mt-1'} />

		<!-- Data sources (detail only). The links to the actual source records live on
		     the type tags in the header; these rows are provider/dataset attribution. -->
		<FieldList fields={sourceFields} class="px-2 py-2" />

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
</div>
