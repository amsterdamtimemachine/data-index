<script lang="ts">
	import type { FeatureResult } from '@atm/shared/types';
	import { translate } from '$utils/translations';
	import { formatDatasetTitle } from '$utils/format';
	import { featureViewerState } from '$lib/state/featureState.svelte';
	import FeatureCardHeader from '$components/FeatureCardHeader.svelte';
	import FeatureCardImage from '$components/FeatureCardImage.svelte';
	import FeatureCardText from '$components/FeatureCardText.svelte';
	import EntityDetail from '$components/EntityDetail.svelte';
	import TagList from '$components/TagList.svelte';
	import Heading from '$components/Heading.svelte';
	import Link from '$components/Link.svelte';

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
		{#if expanded && feature.entity}
			<EntityDetail entity={feature.entity} class="px-2 py-2" />
		{/if}

		<!-- Data sources (detail only) — same label:value layout as the other detail fields.
		     The links to the actual source records live on the type tags in the header. -->
		{#if expanded && (feature.organisationLabel || feature.placeProviderLabel)}
			<dl class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-base text-gray-700 px-2 py-2">
				{#if feature.organisationLabel}
					<dt class="text-gray-500">{translate('dataProvider')}</dt>
					<dd>
						{#if feature.organisationUrl}
							<Link href={feature.organisationUrl} target="_blank" rel="noopener noreferrer">{feature.organisationLabel}</Link>
						{:else}
							{feature.organisationLabel}
						{/if}
					</dd>
				{/if}
				{#if feature.datasetLabel && feature.datasetLabel !== feature.organisationLabel}
					<dt class="text-gray-500">{translate('dataset')}</dt>
					<dd>
						{#if feature.datasetUrl}
							<Link href={feature.datasetUrl} target="_blank" rel="noopener noreferrer">{formatDatasetTitle(feature.datasetLabel)}</Link>
						{:else}
							{formatDatasetTitle(feature.datasetLabel)}
						{/if}
					</dd>
				{/if}
				{#if feature.placeProviderLabel && feature.placeProviderUrl}
					<dt class="text-gray-500">{translate('placeDataProvider')}</dt>
					<dd><Link href={feature.placeProviderUrl} target="_blank" rel="noopener noreferrer">{feature.placeProviderLabel}</Link></dd>
				{/if}
			</dl>
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
</div>
