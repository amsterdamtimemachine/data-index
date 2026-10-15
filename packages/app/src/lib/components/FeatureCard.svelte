<script lang="ts">
	import type { FeatureResult } from '@atm/shared/types';
	import { translate, translateAll } from '$utils/translations';
	import { resolveCardFields, dataSourceFields, programmeBillRows, programmeBillHeading, relationLine } from '$utils/cardFields';
	import { featureViewerState } from '$lib/state/featureState.svelte';
	import FeatureCardHeader from '$components/FeatureCardHeader.svelte';
	import FeatureCardImage from '$components/FeatureCardImage.svelte';
	import FeatureCardText from '$components/FeatureCardText.svelte';
	import FeatureCardExcerpt from '$components/FeatureCardExcerpt.svelte';
	import { pickExcerpt, excerptWindow, segmentText, foldSegments, COLLAPSED_EXCERPT_LENGTH } from '$utils/excerpts';
	import FieldList from '$components/FieldList.svelte';
	import Link from '$components/Link.svelte';
	import EvidenceHighlight from '$components/EvidenceHighlight.svelte';
	import TagList from '$components/TagList.svelte';
	import Heading from '$components/Heading.svelte';

	type Props = {
		feature: FeatureResult;
		expanded?: boolean;
		// an expanded card's close button, in the header where the expand button sits
		onClose?: () => void;
	};

	let { feature, expanded = false, onClose }: Props = $props();

	// the per-type content keys on the entity
	const entityType = $derived(feature.entity?.type);

	const placeLine = $derived(relationLine(feature));

	// collapsed: the summary fields; expanded: every field, between what and where and the sources
	const entityFields = $derived(feature.entity ? resolveCardFields(feature.entity, expanded) : []);
	// expanded: what and where, the item's own fields, then where it comes from
	// expanded, below the item's own fields: where it comes from
	const provenanceFields = $derived(dataSourceFields(feature, expanded));

	const billHeading = $derived(programmeBillHeading(feature.entity));
	// a programme's whole bill, films and acts, when expanded
	const billRows = $derived.by(() => {
		if (!expanded) {
			return [];
		}
		return programmeBillRows(feature.entity);
	});
	// a story opens at the place it is shown at: the whole excerpt when expanded, a
	// window around the first mention collapsed
	const storyExcerpt = $derived.by(() => {
		if (feature.entity?.type !== 'Manuscript') {
			return null;
		}
		const excerpt = pickExcerpt(feature.entity, feature.placeId);
		if (!excerpt) {
			return null;
		}
		if (expanded) {
			return excerpt;
		}
		return excerptWindow(excerpt, COLLAPSED_EXCERPT_LENGTH);
	});
	// the place is marked in the text shown, so the relation line takes the same colour
	const hasEvidence = $derived(storyExcerpt !== null && storyExcerpt.mentions.length > 0);
	const storySegments = $derived.by(() => {
		if (!storyExcerpt) {
			return [];
		}
		return foldSegments(segmentText(storyExcerpt.text, storyExcerpt.mentions));
	});
	// the content region scrolls for these: the blocks above and below it cast the edge shadows
	const scrollingContent = $derived(expanded && (billRows.length > 0 || storyExcerpt !== null));
	const SHADOW_DOWN = 'shadow-edge-down';
	const SHADOW_UP = 'shadow-edge-up';

	const entityFieldsClasses = $derived.by(() => {
		if (!expanded) {
			return 'mt-1';
		}
		if (scrollingContent) {
			return `px-2 py-2 shrink-0 relative z-10 bg-atm-sand border-t border-atm-sand-border ${SHADOW_UP}`;
		}
		return 'px-2 py-2 shrink-0';
	});
	// the title and place line cast the shadow onto content that scrolls under them
	const titleBlockClasses = $derived.by(() => {
		if (scrollingContent) {
			return `shrink-0 relative z-10 bg-atm-sand pb-1 ${SHADOW_DOWN}`;
		}
		return 'shrink-0';
	});

	// expanded, the card is a column capped at the modal's height: head, fields and
	// sources stay, the content region (image, rows, text) is what scrolls
	const rootClasses = $derived.by(() => {
		const base = 'w-full border rounded-sm border-atm-sand-border bg-atm-sand min-w-0';
		if (expanded) {
			return `${base} flex flex-col min-h-0 max-h-full`;
		}
		return base;
	});
	const bodyClasses = $derived.by(() => {
		if (expanded) {
			return 'flex flex-col min-h-0';
		}
		return 'p-2';
	});
	// expanded, text and bills scroll; a picture never does, it shrinks to the room
	// left between the title and the fields and is shown whole
	const contentClasses = $derived.by(() => {
		if (!expanded) {
			return '';
		}
		if (entityType === 'MediaObject' && feature.contentUrl) {
			return 'min-h-0 flex flex-col overflow-hidden';
		}
		return 'min-h-0 overflow-y-auto';
	});

	// collapsed cards open; an expanded card has nothing further to open
	const expandHandler = $derived.by(() => {
		if (expanded) {
			return undefined;
		}
		return handleExpand;
	});

	function handleExpand() {
		featureViewerState.openFeature(feature);
	}
</script>

<div class={rootClasses}>
	<FeatureCardHeader class="p-2 shrink-0" {feature} onExpand={expandHandler} {onClose} />
	<div class={bodyClasses}>
		<div class={titleBlockClasses}>
			<Heading
			level={3}
				class={expanded
					? 'font-medium text-xl my-3 px-2'
					: 'font-medium text-lg line-clamp-2 mb-0'}
			>
				{feature.label}
			</Heading>
			<!-- the type, then how the item relates to its place, the place linked to its record -->
			<p class="italic text-gray-500 {expanded ? 'px-2 mb-2' : 'mb-1'} text-base">
				{placeLine.type}{#if placeLine.relation || placeLine.place}{' • '}{/if}{#if placeLine.relation}{placeLine.relation}{' '}{/if}{#if placeLine.place}{#if hasEvidence}<EvidenceHighlight href={placeLine.placeHref}>{placeLine.place}{placeLine.now ?? ''}</EvidenceHighlight>{:else if placeLine.placeHref}<Link href={placeLine.placeHref} target="_blank" rel="noopener noreferrer" class="inline text-gray-500">{placeLine.place}{placeLine.now ?? ''}</Link>{:else}{placeLine.place}{placeLine.now ?? ''}{/if}{/if}{placeLine.date ?? ''}
			</p>
		</div>
		<!-- Entity-specific content: the region that scrolls when expanded -->
		<div class={contentClasses}>
			{#if entityType === 'MediaObject' && feature.contentUrl}
				<FeatureCardImage
					thumbnail={feature.contentUrl}
					alt={feature.description}
					{expanded}
					onExpand={handleExpand}
				/>
			{/if}
			{#if billRows.length > 0}
				{#if billHeading}
					<p class="px-2 pt-3 text-base text-gray-700">{billHeading}</p>
				{/if}
				<FieldList fields={billRows} class="px-2 py-3" />
			{/if}
			{#if storyExcerpt}
				<FeatureCardExcerpt
					segments={storySegments}
					truncatedBefore={storyExcerpt.truncatedBefore}
					truncatedAfter={storyExcerpt.truncatedAfter}
					sourceUrl={feature.url}
					{expanded}
				/>
			{:else if feature.description}
				<FeatureCardText text={feature.description} {expanded} />
			{/if}
		</div>
		{#if expanded}
			<!-- the item's own fields, then where it comes from -->
			<div class={entityFieldsClasses}>
				{#if entityFields.length > 0}
					<FieldList fields={entityFields} class="mb-3" />
				{/if}
				{#if provenanceFields.length > 0}
					<Heading level={4} class="font-medium mb-1">{translate('provenance')}</Heading>
					<FieldList fields={provenanceFields} />
				{/if}
			</div>
		{:else}
			<FieldList fields={entityFields} class="mt-1" />
		{/if}

		<TagList
			tags={translateAll(feature.tags || [])}
			{expanded}
			maxVisible={expanded ? undefined : 3}
			class={expanded ? 'py-2 px-2 shrink-0' : 'pt-2'}
		/>
	</div>
</div>
