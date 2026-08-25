<script lang="ts">
	import type { Histogram, HistogramBin } from '@atm/shared/types';
	import { mergeCss } from '$utils/utils';
	import TimePeriodSelectorHistogram from '$components/TimePeriodSelectorHistogram.svelte';
	import TimePeriodSelectorLabels from '$components/TimePeriodSelectorLabels.svelte';
	import TimePeriodSelectorThumb from '$components/TimePeriodSelectorThumb.svelte';
	import TimePeriodSelectorTrack from '$components/TimePeriodSelectorTrack.svelte';
	import { createMediaQuery, MOBILE_QUERY } from '$utils/media.svelte';

	interface Props {
		histogram: Histogram;
		localHistogram?: Histogram | null;
		period?: string;
		onPeriodChange?: (newPeriod: string) => void;
		class?: string;
	}
	let {
		histogram,
		localHistogram = null,
		period = undefined,
		onPeriodChange = undefined,
		class: className
	}: Props = $props();

	// Extract time period data
	const timePeriods = $derived(histogram?.bins?.map((bin) => bin.timeSlice.key) || []);
	const displayPeriods = $derived(createDisplayPeriods(histogram?.bins || []));

	// Desktop grows to two stacked bands (selection over global) when a cell is
	// selected; mobile keeps one band (the selection's own series).
	const BAND_HEIGHT = 15;
	const BAND_GAP = 2;
	const isMobile = createMediaQuery(MOBILE_QUERY);
	const hasLocal = $derived.by(() => {
		if (!localHistogram) {
			return false;
		}
		return localHistogram.bins.length > 0;
	});
	const stacked = $derived(hasLocal && !isMobile.matches);
	const hideGlobal = $derived(hasLocal && isMobile.matches);
	const timelineHeight = $derived.by(() => {
		if (stacked) {
			return BAND_HEIGHT * 2 + BAND_GAP;
		}
		return BAND_HEIGHT;
	});

	// Slider state
	let currentIndex = $state(getInitialIndex());
	let isDragging = $state(false);
	let trackElement: HTMLDivElement | undefined = $state();
	let scrollWrapper: HTMLDivElement | undefined = $state();

	// One-shot: centre the thumb when the period first resolves (it may arrive after
	// mount); a touch on the timeline before that forfeits it. After either, the
	// scroll position is user-owned.
	let hasAutoScrolled = false;

	$effect(() => {
		const wrapper = scrollWrapper;
		const track = trackElement;
		const index = timePeriods.indexOf(period ?? '');
		if (hasAutoScrolled || !wrapper || !track || index < 0) {
			return;
		}
		hasAutoScrolled = true;
		const binWidth = track.scrollWidth / timePeriods.length;
		const thumbCenter = (index + 0.5) * binWidth;
		wrapper.scrollTo({ left: thumbCenter - wrapper.clientWidth / 2 });
	});

	// Update currentIndex when period prop changes
	$effect(() => {
		if (period && timePeriods.length > 0) {
			const index = timePeriods.indexOf(period);
			if (index >= 0 && index !== currentIndex) {
				currentIndex = index;
			}
		}
	});

	function createDisplayPeriods(bins: HistogramBin[]): string[] {
		if (!bins.length) return [];

		const result = bins.map((bin) => {
			return bin.timeSlice.startYear.toString();
		});

		// Add the end year of the last bin for the final tick
		const lastBin = bins[bins.length - 1];
		if (lastBin?.timeSlice?.endYear) {
			result.push(lastBin.timeSlice.endYear.toString());
		}

		return result;
	}

	function getInitialIndex(): number {
		if (!period || !timePeriods.length) return 0;
		const index = timePeriods.indexOf(period);
		if (index >= 0) {
			return index;
		}
		return 0;
	}

	function handleIndexChange(newIndex: number) {
		if (newIndex >= 0 && newIndex < timePeriods.length && onPeriodChange) {
			currentIndex = newIndex;
			const periodValue = timePeriods[newIndex];
			onPeriodChange(periodValue);
		}
	}

	function handleDragStart(event: PointerEvent) {
		isDragging = true;
		event.preventDefault();
	}

	function handlePointerMove(event: PointerEvent) {
		if (!isDragging || !trackElement) return;

		const rect = trackElement.getBoundingClientRect();
		const dragX = event.clientX - rect.left;
		const percentage = Math.max(0, Math.min(1, dragX / rect.width));
		const newIndex = Math.round(percentage * (timePeriods.length - 1));

		handleIndexChange(newIndex);
	}

	function handlePointerUp() {
		isDragging = false;
	}

	function handleKeyDown(event: KeyboardEvent) {
		let newIndex = currentIndex;

		switch (event.key) {
			case 'ArrowLeft':
			case 'ArrowDown':
				newIndex = Math.max(0, currentIndex - 1);
				break;
			case 'ArrowRight':
			case 'ArrowUp':
				newIndex = Math.min(timePeriods.length - 1, currentIndex + 1);
				break;
			case 'Home':
				newIndex = 0;
				break;
			case 'End':
				newIndex = timePeriods.length - 1;
				break;
			default:
				return;
		}

		event.preventDefault();
		handleIndexChange(newIndex);
	}
</script>

<!-- Global pointer events for drag behavior: mouse drags reach the document directly;
     touch drags reach it by bubbling from the thumb, which implicitly captures the
     pointer and blocks scrolling via touch-action -->
<svelte:document
	onpointermove={handlePointerMove}
	onpointerup={handlePointerUp}
	onpointercancel={handlePointerUp}
/>

{#if histogram?.bins?.length > 0}
	<div class={mergeCss('bg-atm-sand border-t border-atm-sand-border w-full px-4 pt-2', className)}>
		<!-- Horizontal scroll wrapper for mobile; pointerdown only forfeits the one-shot
		     auto-scroll, it is not an interaction affordance -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			bind:this={scrollWrapper}
			onpointerdown={() => (hasAutoScrolled = true)}
			class="w-full overflow-x-auto max-[850px]:overflow-x-auto min-[851px]:overflow-x-visible relative max-[850px]:shadow-[inset_10px_0_10px_-10px_rgba(0,0,0,0.3),inset_-10px_0_10px_-10px_rgba(0,0,0,0.3)]"
		>
			<div
				class="relative"
				style="min-width: max(800px, {histogram.bins.length * 60}px); width: 100%; height: {timelineHeight + 25}px;"
				bind:this={trackElement}
			>
			<!-- Histogram Layer: Histogram bars and grid -->
			<TimePeriodSelectorHistogram
				bins={histogram?.bins || []}
				maxCount={histogram?.maxCount || 0}
				localBins={localHistogram?.bins || []}
				localMaxCount={localHistogram?.maxCount || 0}
				{timelineHeight}
				bandHeight={BAND_HEIGHT}
				{stacked}
				{hideGlobal}
			/>

			<!-- Labels Layer: Year labels -->
			<TimePeriodSelectorLabels {displayPeriods} {timelineHeight} />

			<!-- Interactive Layer: Clickable track -->
			<TimePeriodSelectorTrack
				bins={histogram.bins}
				localBins={localHistogram?.bins || []}
				{currentIndex}
				onIndexChange={handleIndexChange}
				{timelineHeight}
				onKeyDown={handleKeyDown}
			/>

			<!-- Thumb Layer: Draggable indicator -->
			<TimePeriodSelectorThumb
				{currentIndex}
				totalBins={histogram.bins.length}
				localBins={localHistogram?.bins || []}
				{isDragging}
				onDragStart={handleDragStart}
				{timelineHeight}
				bins={histogram.bins}
			/>
			</div>
		</div>
	</div>
{/if}
