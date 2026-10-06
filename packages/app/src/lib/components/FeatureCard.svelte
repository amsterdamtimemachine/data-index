<script lang="ts">
	import type { FeatureResult, GroupFeature } from '@atm/shared/types';
	import { translate, translateAll } from '$utils/translations';
	import { resolveCardFields, dataSourceFields, groupMemberRows, venueEventKey } from '$utils/cardFields';
	import { featureViewerState } from '$lib/state/featureState.svelte';
	import FeatureCardHeader from '$components/FeatureCardHeader.svelte';
	import FeatureCardImage from '$components/FeatureCardImage.svelte';
	import FeatureCardText from '$components/FeatureCardText.svelte';
	import FieldList from '$components/FieldList.svelte';
	import TagList from '$components/TagList.svelte';
	import Heading from '$components/Heading.svelte';
	import ToggleGroup from '$components/ToggleGroup.svelte';
	import Tag from '$components/Tag.svelte';
	import FeaturesCount from '$components/FeaturesCount.svelte';
	import DataTooltip from '$components/DataTooltip.svelte';
	import { createMediaQuery, HOVER_QUERY } from '$utils/media.svelte';

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

	const entityFields = $derived(feature.entity ? resolveCardFields(feature.entity, expanded) : []);
	const sourceFields = $derived(dataSourceFields(feature, expanded));

	const series = $derived.by(() => {
		if (feature.entity?.type === 'EventSeries') {
			return feature.entity;
		}
		return null;
	});
	const yearItems = $derived.by(() => {
		if (!series) {
			return [];
		}
		return series.years.map((y) => String(y.year));
	});
	const selectedYearItems = $derived.by(() => {
		if (groupYear === null) {
			return [];
		}
		return [String(groupYear)];
	});
	// the chosen year's count
	const yearCount = $derived.by(() => {
		if (!series || groupYear === null) {
			return 0;
		}
		const match = series.years.find((y) => y.year === groupYear);
		if (!match) {
			return 0;
		}
		return match.count;
	});
	const memberRows = $derived(groupMemberRows(groupMembers));

	// a short shadow on the two edges that face the scrolling programme: cast down
	// from the count line, up from the fields block; the negative spread keeps each
	// to its one side
	const SHADOW_DOWN = 'shadow-edge-down';
	const SHADOW_UP = 'shadow-edge-up';

	// what the series holds, by its venue's kind: vertoningen, voorstellingen, evenementen
	const eventWord = $derived.by(() => {
		if (!series) {
			return '';
		}
		return translate(venueEventKey(series.location.type)).toLowerCase();
	});
	const entityFieldsClasses = $derived.by(() => {
		if (!expanded) {
			return 'mt-1';
		}
		if (series) {
			return `px-2 py-2 shrink-0 relative z-10 bg-atm-sand border-t border-atm-sand-border ${SHADOW_UP}`;
		}
		return 'px-2 py-2 shrink-0';
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

	// the year under the pointer and where its readout goes: above the tag's centre
	const hoverCapable = createMediaQuery(HOVER_QUERY);
	let hoveredYear = $state<{ count: number; x: number; y: number } | null>(null);

	function handleYearHover(item: string | null, element: HTMLElement | null) {
		if (!series || item === null || element === null) {
			hoveredYear = null;
			return;
		}
		const match = series.years.find((y) => String(y.year) === item);
		if (!match) {
			hoveredYear = null;
			return;
		}
		const rect = element.getBoundingClientRect();
		hoveredYear = { count: match.count, x: rect.left + rect.width / 2, y: rect.top };
	}

	function yearTagVariant(isSelected: boolean): 'selected-outline' | 'default' {
		if (isSelected) {
			return 'selected-outline';
		}
		return 'default';
	}

	function handleYearSelected(selected: string[] | string) {
		if (typeof selected !== 'string' || !onYearSelect) {
			return;
		}
		onYearSelect(parseInt(selected, 10));
	}

	function handleExpand() {
		featureViewerState.openFeature(feature);
	}
</script>

<div class={rootClasses}>
	<FeatureCardHeader class="p-2 shrink-0" {feature} {expanded} onExpand={handleExpand} />
	<div class={bodyClasses}>
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
		{#if series && expanded}
			<!-- a group: the strip of its years and the year's count stay above the rows -->
			<div class="px-2 py-2 shrink-0 border-t border-atm-sand-border">
				<ToggleGroup
					items={yearItems}
					selectedItems={selectedYearItems}
					type="single"
					orientation="horizontal"
					indicator={false}
					sorted={false}
					requireOneItemSelected
					onItemSelected={handleYearSelected}
					onItemHover={handleYearHover}
					class="flex-wrap"
				>
					{#snippet children(item, isSelected)}
						<Tag variant={yearTagVariant(isSelected)} interactive>{item}</Tag>
					{/snippet}
				</ToggleGroup>
			</div>
			{#if hoverCapable.matches && hoveredYear}
				<DataTooltip x={hoveredYear.x} y={hoveredYear.y}>
					<div class="font-medium">{hoveredYear.count} {eventWord}</div>
				</DataTooltip>
			{/if}
			{#if yearCount > 0}
				<div class="px-2 py-2 shrink-0 relative z-10 bg-atm-sand {SHADOW_DOWN}">
					<FeaturesCount count={yearCount}>
						{#snippet children(shown)}
							{shown} {eventWord} {translate('inYear')} {groupYear}
						{/snippet}
					</FeaturesCount>
				</div>
			{/if}
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
			{#if series && expanded}
				<FieldList fields={memberRows} class="px-2 py-3" />
			{/if}
			{#if feature.description}
				<FeatureCardText text={feature.description} {expanded} />
			{/if}
		</div>
		<!-- Entity fields (born/died, date/author). Collapsed keeps the summary fields;
		     detail shows them all — same label:value layout either way. -->
		<FieldList fields={entityFields} class={entityFieldsClasses} />

		<!-- Data sources (detail only). The links to the actual source records live on
		     the type tags in the header; these rows are provider/dataset attribution. -->
		<FieldList fields={sourceFields} class="px-2 py-2 shrink-0" />

		<TagList
			tags={translateAll(feature.tags || [])}
			{expanded}
			maxVisible={expanded ? undefined : 3}
			class={expanded ? 'py-2 px-2 shrink-0' : 'pt-2'}
		/>
	</div>
</div>
