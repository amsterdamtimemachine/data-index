<script lang="ts">
	import type { FeatureResult, GroupFeature } from '@atm/shared/types';
	import { translate, translateAll } from '$utils/translations';
	import { resolveCardFields, dataSourceFields } from '$utils/cardFields';
	import { featureViewerState } from '$lib/state/featureState.svelte';
	import FeatureCardHeader from '$components/FeatureCardHeader.svelte';
	import FeatureCardImage from '$components/FeatureCardImage.svelte';
	import FeatureCardText from '$components/FeatureCardText.svelte';
	import FieldList from '$components/FieldList.svelte';
	import TagList from '$components/TagList.svelte';
	import Heading from '$components/Heading.svelte';
	import FeatureCardProgrammeByYear from '$components/FeatureCardProgrammeByYear.svelte';
	import { foldLines } from '$utils/format';

	type Props = {
		feature: FeatureResult;
		expanded?: boolean;
		// a group row's expanded view: the year shown, its members, and the strip's callback
		groupYear?: number | null;
		groupMembers?: GroupFeature[];
		onYearSelect?: (year: number) => void;
	};

	let { feature, expanded = false, groupYear = null, groupMembers = [], onYearSelect }: Props = $props();

	// the per-type content keys on the entity
	const entityType = $derived(feature.entity?.type);

	// one list: the entity's fields, then the data source rows (which are empty when collapsed)
	const entityFields = $derived(feature.entity ? resolveCardFields(feature.entity, expanded) : []);
	const detailFields = $derived([...entityFields, ...dataSourceFields(feature, expanded)]);

	const series = $derived.by(() => {
		if (feature.entity?.type === 'EventSeries') {
			return feature.entity;
		}
		return null;
	});
	// a story's transcription read as prose: the whole text when expanded, the
	// description's excerpt collapsed
	const storyText = $derived.by(() => {
		if (feature.entity?.type !== 'Manuscript') {
			return null;
		}
		if (expanded) {
			return foldLines(feature.entity.text);
		}
		return foldLines(feature.description ?? '');
	});
	// the content region scrolls for these: the blocks above and below it cast the edge shadows
	const scrollingContent = $derived(expanded && (series !== null || storyText !== null));
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
	// a story has no strip: its title and place line cast the shadow onto the text
	const titleBlockClasses = $derived.by(() => {
		if (expanded && storyText !== null) {
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
	const contentClasses = $derived.by(() => {
		if (expanded) {
			return 'min-h-0 overflow-y-auto';
		}
		return '';
	});

	function handleExpand() {
		featureViewerState.openFeature(feature);
	}
</script>

<div class={rootClasses}>
	<FeatureCardHeader class="p-2 shrink-0" {feature} {expanded} onExpand={handleExpand} />
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
			{#if feature.relationId || feature.displayName || feature.historicalLabel}
				{@const placeName = feature.historicalLabel || feature.displayName}
				{@const showBoth = feature.historicalLabel && feature.displayName && feature.historicalLabel !== feature.displayName}
				<p class="italic text-gray-500 {expanded ? 'px-2 mb-2' : 'mb-1'} text-base">
					{feature.relationId ? translate(feature.relationId) : ''}{placeName ? ` ${placeName}` : ''}{showBoth ? ` (nu ${feature.displayName})` : ''}
				</p>
			{/if}
		</div>
		{#if series && expanded}
			<FeatureCardProgrammeByYear {series} year={groupYear} members={groupMembers} {onYearSelect} />
		{/if}
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
			{#if storyText !== null}
				<FeatureCardText text={storyText} {expanded} />
			{:else if feature.description}
				<FeatureCardText text={feature.description} {expanded} />
			{/if}
		</div>
		<!-- Entity fields (born/died, date/author) and, in detail, the provider/dataset
		     attribution. Collapsed keeps the summary fields; detail shows them all. The
		     links to the actual source records live on the type tags in the header. -->
		<FieldList fields={detailFields} class={entityFieldsClasses} />

		<TagList
			tags={translateAll(feature.tags || [])}
			{expanded}
			maxVisible={expanded ? undefined : 3}
			class={expanded ? 'py-2 px-2 shrink-0' : 'pt-2'}
		/>
	</div>
</div>
