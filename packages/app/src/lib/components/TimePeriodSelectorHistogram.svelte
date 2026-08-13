<script lang="ts">
	import type { HistogramBin } from '@atm/shared/types';
	import { calculateHistogramBarHeights } from '$lib/utils/histogram';
	import { createMediaQuery } from '$utils/media.svelte';

	interface Props {
		bins: HistogramBin[];
		maxCount: number;
		timelineHeight: number;
	}
	let { bins, maxCount, timelineHeight }: Props = $props();

	// Taps synthesise mouseenter without a matching leave — tooltip is hover-only.
	const hoverCapable = createMediaQuery('(hover: hover) and (pointer: fine)');

	// Calculate bar heights using logarithmic scaling with global maxCount
	const barHeights = $derived(bins && bins.length > 0 ? calculateHistogramBarHeights(bins, maxCount, timelineHeight, 1) : []);
	
	// Hover state for tooltip
	let hoveredBin = $state<{ bin: HistogramBin; index: number } | null>(null);
	let mousePosition = $state({ x: 0, y: 0 });
	let svgElement: SVGSVGElement | undefined = $state();

	function handleMouseEnter(event: MouseEvent, bin: HistogramBin, index: number) {
		hoveredBin = { bin, index };
		updateMousePosition(event);
	}

	function handleMouseLeave() {
		hoveredBin = null;
	}

	function handleMouseMove(event: MouseEvent) {
		if (hoveredBin) {
			updateMousePosition(event);
		}
	}

	function updateMousePosition(event: MouseEvent) {
		mousePosition = { x: event.clientX, y: event.clientY };
	}
	
	// Features text with English pluralization
	const featuresText = $derived(() => {
		if (!hoveredBin) return '';
		const count = hoveredBin.bin.count;
		return count === 1 ? 'feature' : 'features';
	});
</script>

<svg bind:this={svgElement} class="absolute top-0 w-full h-full">
	<!-- Histogram bars -->
	{#each bins as bin, i}
		{@const barWidth = 100 / bins.length}
		{@const barHeight = barHeights[i]}
		{@const x = (i / bins.length) * 100}
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<rect
			x="{x}%"
			y={timelineHeight - barHeight}
			width="{barWidth}%"
			height={barHeight}
			class="fill-atm-blue cursor-pointer"
			fill="#5480f1"
			onmouseenter={(e) => handleMouseEnter(e, bin, i)}
			onmouseleave={handleMouseLeave}
			onmousemove={handleMouseMove}
		></rect>
	{/each}

	<!-- Ticks at period boundaries -->
	{#each Array(bins.length + 1) as _, i}
		{@const position = (i / bins.length) * 100}
		<line
			x1="{position}%"
			y1="0"
			x2="{position}%"
			y2={timelineHeight}
			stroke="black"
			stroke-width="0.5"
			transform={i === 0 ? 'translate(0.5, 0)' : i === bins.length ? 'translate(-0.5, 0)' : ''}
		/>
	{/each}

	<!-- Track line -->
	<line
		x1="0%"
		y1={timelineHeight}
		x2="100%"
		y2={timelineHeight}
		stroke="black"
		stroke-width="0.5"
	/>
</svg>

<!-- Hover tooltip -->
{#if hoverCapable.matches && hoveredBin}
	<div 
		class="fixed z-50 bg-black bg-opacity-80 text-white px-2 py-1 rounded text-sm pointer-events-none transform -translate-x-1/2 -translate-y-full"
		style="left: {mousePosition.x}px; top: {mousePosition.y - 8}px;"
	>
		<div class="font-medium">{hoveredBin.bin.count} {featuresText()}</div>
		<div class="text-xs opacity-75">Periode: {hoveredBin.bin.timeSlice.label}</div>
	</div>
{/if}
