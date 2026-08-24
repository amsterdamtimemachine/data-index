<script lang="ts">
	import type { HistogramBin } from '@atm/shared/types';
	import { createMediaQuery, HOVER_QUERY } from '$utils/media.svelte';
	import TimePeriodTooltip from '$components/TimePeriodTooltip.svelte';

	interface Props {
		currentIndex: number;
		totalBins: number;
		isDragging: boolean;
		onDragStart: (event: PointerEvent) => void;
		timelineHeight: number;
		bins: HistogramBin[];
		localBins?: HistogramBin[];
	}
	let { currentIndex, totalBins, isDragging, onDragStart, timelineHeight, bins, localBins = [] }: Props = $props();

	const hoverCapable = createMediaQuery(HOVER_QUERY);

	let isHovering = $state(false);
	let mousePosition = $state({ x: 0, y: 0 });

	function handleMouseEnter(event: MouseEvent) {
		isHovering = true;
		mousePosition = { x: event.clientX, y: event.clientY };
	}

	function handleMouseLeave() {
		isHovering = false;
	}

	function handleMouseMove(event: MouseEvent) {
		if (isHovering) {
			mousePosition = { x: event.clientX, y: event.clientY };
		}
	}

	const thumbPosition = $derived.by(() => {
		if (totalBins <= 1) {
			return 0;
		}
		return (currentIndex / totalBins) * 100;
	});

	const thumbWidth = $derived.by(() => {
		if (totalBins <= 1) {
			return 100;
		}
		return 100 / totalBins;
	});

	const currentBin = $derived(bins[currentIndex]);

	const currentLocalCount = $derived.by(() => {
		if (localBins.length === 0) {
			return null;
		}
		const local = localBins[currentIndex];
		if (!local) {
			return null;
		}
		return local.count;
	});
</script>

<!-- Thumb element -->
<div
	class="absolute z-10 cursor-grab touch-none bg-transparent border-[3px] border-atm-gold-darkest hover:border-atm-gold-darkest-hover"
	class:cursor-grabbing={isDragging}
	style="left: {thumbPosition}%; width: {thumbWidth}%; height: {timelineHeight}px; top: 0;"
	onpointerdown={onDragStart}
	onmouseenter={handleMouseEnter}
	onmouseleave={handleMouseLeave}
	onmousemove={handleMouseMove}
	role="button"
	tabindex="0"
	aria-label="Drag to change time period"
></div>

{#if hoverCapable.matches && isHovering && !isDragging && currentBin}
	<TimePeriodTooltip
		bin={currentBin}
		localCount={currentLocalCount}
		x={mousePosition.x}
		y={mousePosition.y}
	/>
{/if}
