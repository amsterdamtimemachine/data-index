<script lang="ts">
	import { translate } from '#lib/utils/translations.js';
	import type { HistogramBin } from '@atm/shared/types';
	import { createMediaQuery, HOVER_QUERY } from '#lib/utils/media.svelte.js';
	import TimePeriodTooltip from '#lib/components/TimePeriodTooltip.svelte';
	import { selectionCountFor } from '#lib/utils/histogram.js';
	import { periodValueText } from '#lib/a11y/announcements.js';

	interface Props {
		bins: HistogramBin[];
		// the selection's series while it is on screen, for the hover tooltip
		localBins?: HistogramBin[];
		// the selection's series under the city-wide one: the hover names its count
		// for bins where it has data
		selectionBins?: HistogramBin[];
		currentIndex: number;
		onIndexChange: (newIndex: number) => void;
		timelineHeight: number;
		onKeyDown?: (event: KeyboardEvent) => void;
		// a press on a bin starts a drag; the selector follows the pointer from there
		onDragStart: (event: PointerEvent) => void;
	}
	let { bins, localBins = [], selectionBins = [], currentIndex, onIndexChange, timelineHeight, onKeyDown, onDragStart }: Props = $props();

	const hoverCapable = createMediaQuery(HOVER_QUERY);

	let hoveredBin = $state<{ bin: HistogramBin; index: number } | null>(null);
	let mousePosition = $state({ x: 0, y: 0 });

	function handleMouseEnter(event: MouseEvent, bin: HistogramBin, index: number) {
		hoveredBin = { bin, index };
		mousePosition = { x: event.clientX, y: event.clientY };
	}

	function handleMouseLeave() {
		hoveredBin = null;
	}

	function handleMouseMove(event: MouseEvent) {
		if (hoveredBin) {
			mousePosition = { x: event.clientX, y: event.clientY };
		}
	}

	const hoveredLocalCount = $derived.by(() => {
		if (!hoveredBin || localBins.length === 0) {
			return null;
		}
		const local = localBins[hoveredBin.index];
		if (!local) {
			return null;
		}
		return local.count;
	});

	const hoveredSelectionCount = $derived.by(() => {
		if (!hoveredBin) {
			return null;
		}
		return selectionCountFor(selectionBins, hoveredBin.bin.timeSlice.key);
	});

	let slider: HTMLDivElement | undefined = $state();

	// what a screen reader hears for the selected period: the counts the tooltip shows
	const valueText = $derived.by(() => {
		const bin = bins[currentIndex];
		if (!bin) {
			return '';
		}
		let localCount: number | null = null;
		if (localBins.length > 0) {
			localCount = localBins[currentIndex]?.count ?? 0;
		}
		return periodValueText(bin.timeSlice.label, bin.count, localCount, selectionCountFor(selectionBins, bin.timeSlice.key));
	});

	// a press selects the bin under the pointer and starts a drag from it. The drag
	// cancels the press's default, which would also have moved focus, so the slider
	// takes focus itself: the arrow keys then step the timeline instead of panning the map.
	function handleBinPointerDown(event: PointerEvent, index: number) {
		onIndexChange(index);
		onDragStart(event);
		slider?.focus({ preventScroll: true });
	}
</script>

<!-- One Tab stop: the slider. The arrow keys, Home and End step it; focus shows on
     the selected bin's frame (TimePeriodSelectorThumb, a later sibling: peer). -->
<div
	bind:this={slider}
	class="peer absolute top-0 inset-x-0 cursor-pointer focus-visible:outline-none"
	style="height: {timelineHeight}px;"
	role="slider"
	tabindex="0"
	aria-label={translate('timePeriodSelector')}
	aria-valuemin="0"
	aria-valuemax={bins.length - 1}
	aria-valuenow={currentIndex}
	aria-valuetext={valueText}
	onkeydown={onKeyDown}
>
	<!-- a press area per period, for the pointer only: a slider's parts are not separate
	     controls, so they take no focus and screen readers hear the slider's value -->
	{#each bins as bin, i}
		{@const barWidth = 100 / bins.length}
		{@const x = (i / bins.length) * 100}
		<div
			aria-hidden="true"
			class="absolute h-full bg-transparent hover:border-atm-gold-darkest-hover hover:border-[4px] cursor-pointer touch-none"
			style="left: {x}%; width: {barWidth}%;"
			onpointerdown={(e) => handleBinPointerDown(e, i)}
			onmouseenter={(e) => handleMouseEnter(e, bin, i)}
			onmouseleave={handleMouseLeave}
			onmousemove={handleMouseMove}
		></div>
	{/each}
</div>

{#if hoverCapable.matches && hoveredBin}
	<TimePeriodTooltip
		bin={hoveredBin.bin}
		localCount={hoveredLocalCount}
		selectionCount={hoveredSelectionCount}
		x={mousePosition.x}
		y={mousePosition.y}
	/>
{/if}
