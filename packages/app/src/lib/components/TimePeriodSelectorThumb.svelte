<script lang="ts">
	import type { HistogramBin } from '@atm/shared/types';

	interface Props {
		currentIndex: number;
		totalBins: number;
		isDragging: boolean;
		onDragStart: (event: PointerEvent) => void;
		timelineHeight: number;
		bins: HistogramBin[];
	}
	let { currentIndex, totalBins, isDragging, onDragStart, timelineHeight, bins }: Props = $props();

	// Hover state for tooltip
	let isHovering = $state(false);
	let mousePosition = $state({ x: 0, y: 0 });

	function handleMouseEnter(event: MouseEvent) {
		isHovering = true;
		updateMousePosition(event);
	}

	function handleMouseLeave() {
		isHovering = false;
	}

	function handleMouseMove(event: MouseEvent) {
		if (isHovering) {
			updateMousePosition(event);
		}
	}

	function updateMousePosition(event: MouseEvent) {
		mousePosition = { x: event.clientX, y: event.clientY };
	}

	// Thumb position and width calculations
	const thumbPosition = $derived(() => {
		if (totalBins <= 1) return 0;
		return (currentIndex / totalBins) * 100;
	});

	const thumbWidth = $derived(() => {
		if (totalBins <= 1) return 100;
		return 100 / totalBins;
	});

	const currentBin = $derived(() => bins[currentIndex]);
	
	// Features text with Dutch pluralization
	const featuresText = $derived(() => {
		const count = currentBin()?.count || 0;
		return count === 1 ? 'feature' : 'features';
	});
</script>

<!-- Thumb element -->
<div
	class="absolute z-10 cursor-grab touch-none bg-transparent border-[3px] border-atm-red hover:border-atm-red-light"
	class:cursor-grabbing={isDragging}
	style="left: {thumbPosition()}%; width: {thumbWidth()}%; height: {timelineHeight}px; top: 0;"
	onpointerdown={onDragStart}
	onmouseenter={handleMouseEnter}
	onmouseleave={handleMouseLeave}
	onmousemove={handleMouseMove}
	role="button"
	tabindex="0"
	aria-label="Drag to change time period"
></div>

<!-- Hover tooltip -->
{#if isHovering && !isDragging && currentBin()}
	<div 
		class="fixed z-50 bg-black bg-opacity-80 text-white px-2 py-1 rounded text-sm pointer-events-none transform -translate-x-1/2 -translate-y-full"
		style="left: {mousePosition.x}px; top: {mousePosition.y - 8}px;"
	>
		<div class="font-medium">{currentBin().count} {featuresText()}</div>
		<div class="text-xs opacity-75">Periode: {currentBin().timeSlice.label}</div>
	</div>
{/if}
