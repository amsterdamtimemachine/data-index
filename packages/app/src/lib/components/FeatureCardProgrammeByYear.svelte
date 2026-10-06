<!--
	A venue's programme, one year at a time: the strip of the years it was open in
	the period, the chosen year's count, and that year's members as rows, which
	scroll under the strip. A dumb leaf: the years come with the series entity, the
	members and the year are props, a pick goes up through onYearSelect.
-->
<script lang="ts">
	import type { EventSeriesEntity, GroupFeature } from '@atm/shared/types';
	import { translate } from '$utils/translations';
	import { groupMemberRows, venueEventKey } from '$utils/cardFields';
	import { createMediaQuery, HOVER_QUERY } from '$utils/media.svelte';
	import ToggleGroup from '$components/ToggleGroup.svelte';
	import Tag from '$components/Tag.svelte';
	import FieldList from '$components/FieldList.svelte';
	import FeaturesCount from '$components/FeaturesCount.svelte';
	import DataTooltip from '$components/DataTooltip.svelte';

	type Props = {
		series: EventSeriesEntity;
		year: number | null;
		members: GroupFeature[];
		onYearSelect?: (year: number) => void;
	};

	let { series, year, members, onYearSelect }: Props = $props();

	const yearItems = $derived(series.years.map((y) => String(y.year)));
	const selectedYearItems = $derived.by(() => {
		if (year === null) {
			return [];
		}
		return [String(year)];
	});
	const yearCount = $derived.by(() => {
		const match = series.years.find((y) => y.year === year);
		if (!match) {
			return 0;
		}
		return match.count;
	});
	const memberRows = $derived(groupMemberRows(members));
	// what the series holds, by its venue's kind: vertoningen, voorstellingen, evenementen
	const eventWord = $derived(translate(venueEventKey(series.location.type)).toLowerCase());

	// the year under the pointer and where its readout goes: above the tag's centre
	const hoverCapable = createMediaQuery(HOVER_QUERY);
	let hoveredYear = $state<{ count: number; x: number; y: number } | null>(null);

	function handleYearHover(item: string | null, element: HTMLElement | null) {
		if (item === null || element === null) {
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
</script>

<div class="flex flex-col min-h-0">
	<!-- the strip and the count stay; the count casts the edge shadow onto the rows -->
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
		<div class="px-2 py-2 shrink-0 relative z-10 bg-atm-sand shadow-edge-down">
			<FeaturesCount count={yearCount}>
				{#snippet children(shown)}
					{shown} {eventWord} {translate('inYear')} {year}
				{/snippet}
			</FeaturesCount>
		</div>
	{/if}
	<div class="min-h-0 overflow-y-auto">
		<FieldList fields={memberRows} class="px-2 py-3" />
	</div>
</div>
