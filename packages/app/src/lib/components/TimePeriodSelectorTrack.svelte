<script lang="ts">
	import type { HistogramBin } from '@atm/shared/types';
	import { mergeCss } from '$utils/utils';
	import { createMediaQuery } from '$utils/media.svelte';

	interface Props {
		bins: HistogramBin[];
		currentIndex: number;
		onIndexChange: (newIndex: number) => void;
		timelineHeight: number;
		onKeyDown?: (event: KeyboardEvent) => void;
	}
	let { bins, currentIndex, onIndexChange, timelineHeight, onKeyDown }: Props = $props();

	// taps synthesise mouseenter without a matching leave
	const hoverCapable = createMediaQuery('(hover: hover) and (pointer: fine)');

	let trackElement: HTMLDivElement | undefined = $state();
	
	// Hover state for tooltip
	let hoveredBin = $state<{ bin: HistogramBin; index: number } | null>(null);
	let mousePosition = $state({ x: 0, y: 0 });

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

	function handleTrackClick(event: MouseEvent) {
		if (!trackElement) return;

		const rect = trackElement.getBoundingClientRect();
		const clickX = event.clientX - rect.left;
		const percentage = clickX / rect.width;
		const newIndex = Math.round(percentage * (bins.length - 1));

		onIndexChange(Math.max(0, Math.min(bins.length - 1, newIndex)));
	}
</script>

<div
	bind:this={trackElement}
	class="absolute top-0 inset-x-0 cursor-pointer"
	style="height: {timelineHeight}px;"
	onclick={handleTrackClick}
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
			class="absolute h-full bg-transparent hover:border-atm-red-light hover:border-[4px] cursor-pointer"
			style="left: {x}%; width: {barWidth}%;"
			onclick={(e) => {
				e.stopPropagation();
				onIndexChange(i);
			}}
			onmouseenter={(e) => handleMouseEnter(e, bin, i)}
			onmouseleave={handleMouseLeave}
			onmousemove={handleMouseMove}
			aria-label="Select period {bin.timeSlice.label}"
		></button>
	{/each}
</div>

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
