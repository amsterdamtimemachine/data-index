<script lang="ts">
	import type { HistogramBin } from '@atm/shared/types';
	import { createMediaQuery, HOVER_QUERY } from '$utils/media.svelte';
	import TimePeriodTooltip from '$components/TimePeriodTooltip.svelte';
	import { selectionCountFor } from '$utils/histogram';

	interface Props {
		bins: HistogramBin[];
		// the selection's series while it is on screen, for the hover tooltip
		localBins?: HistogramBin[];
		// the selection's series under the city-wide one: the hover names its count
		// for bins where it has data
		markerBins?: HistogramBin[];
		currentIndex: number;
		onIndexChange: (newIndex: number) => void;
		timelineHeight: number;
		onKeyDown?: (event: KeyboardEvent) => void;
		// a press on a bin starts a drag; the selector follows the pointer from there
		onDragStart: (event: PointerEvent) => void;
	}
	let { bins, localBins = [], markerBins = [], currentIndex, onIndexChange, timelineHeight, onKeyDown, onDragStart }: Props = $props();

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
		return selectionCountFor(markerBins, hoveredBin.bin.timeSlice.key);
	});

	// a press selects the bin under the pointer and starts a drag from it; a keyboard
	// activation (no pointer, detail 0) selects it
	function handleBinPointerDown(event: PointerEvent, index: number) {
		onIndexChange(index);
		onDragStart(event);
	}

	function handleBinClick(event: MouseEvent, index: number) {
		event.stopPropagation();
		if (event.detail === 0) {
			onIndexChange(index);
		}
	}
</script>

<div
	class="absolute top-0 inset-x-0 cursor-pointer"
	style="height: {timelineHeight}px;"
	role="slider"
	tabindex="0"
	aria-label="Time period selector"
	aria-valuemin="0"
	aria-valuemax={bins.length - 1}
	aria-valuenow={currentIndex}
	aria-valuetext={bins[currentIndex]?.timeSlice?.label || ''}
	onkeydown={onKeyDown}
>
	<!-- Clickable areas for each period -->
	{#each bins as bin, i}
		{@const barWidth = 100 / bins.length}
		{@const x = (i / bins.length) * 100}
		<button
			class="absolute h-full bg-transparent hover:border-atm-gold-darkest-hover hover:border-[4px] cursor-pointer touch-none"
			style="left: {x}%; width: {barWidth}%;"
			onpointerdown={(e) => handleBinPointerDown(e, i)}
			onclick={(e) => handleBinClick(e, i)}
			onmouseenter={(e) => handleMouseEnter(e, bin, i)}
			onmouseleave={handleMouseLeave}
			onmousemove={handleMouseMove}
			aria-label="Select period {bin.timeSlice.label}"
		></button>
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
