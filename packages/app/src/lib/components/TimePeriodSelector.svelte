<script lang="ts">
	import type { Histogram, HistogramBin } from '@atm/shared/types';
	import { mergeCss } from '$utils/utils';
	import TimePeriodSelectorHistogram from '$components/TimePeriodSelectorHistogram.svelte';
	import TimePeriodSelectorLabels from '$components/TimePeriodSelectorLabels.svelte';
	import TimePeriodSelectorThumb from '$components/TimePeriodSelectorThumb.svelte';
	import TimePeriodSelectorTrack from '$components/TimePeriodSelectorTrack.svelte';
	import Button from '$components/Button.svelte';
	import { asset } from '$app/paths';
	import { translate } from '$utils/translations';

	interface Props {
		histogram: Histogram;
		localHistogram?: Histogram | null;
		// names the local series ("deze cel", a place name); shown only while it is on screen
		localLabel?: string;
		// the switch between the city-wide and the selection's series: rendered only
		// when the page hands over a handler (desktop); on/available describe its state
		onToggleLocal?: () => void;
		localToggleOn?: boolean;
		localAvailable?: boolean;
		period?: string;
		onPeriodChange?: (newPeriod: string) => void;
		class?: string;
	}
	let {
		histogram,
		localHistogram = null,
		localLabel = '',
		onToggleLocal = undefined,
		localToggleOn = false,
		localAvailable = false,
		period = undefined,
		onPeriodChange = undefined,
		class: className
	}: Props = $props();

	// Extract time period data
	const timePeriods = $derived(histogram?.bins?.map((bin) => bin.timeSlice.key) || []);
	const displayPeriods = $derived(createDisplayPeriods(histogram?.bins || []));

	// One band. A local series, when the page passes one, replaces the city-wide
	// one; the page decides when that is (see its localHistogram). An empty series
	// still replaces it: that is the band while a selection's data loads.
	const timelineHeight = 15;
	const hideGlobal = $derived(localHistogram !== null);

	// the button shows the series a press leads to, not the one on screen
	const toggleGlyph = $derived.by(() => {
		if (localToggleOn) {
			return asset('/glyphs/ToggleGlobalTimeline.svg');
		}
		return asset('/glyphs/ToggleLocalTimeline.svg');
	});
	const toggleLabel = $derived.by(() => {
		if (localToggleOn) {
			return translate('toggleGlobalTimeline');
		}
		return translate('toggleLocalTimeline');
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
	<div class={mergeCss('bg-atm-sand border-t border-atm-sand-border w-full px-4 pt-1', className)}>
		<!-- Caption: which series this is; the city-wide default needs none. Kept tight
		     so the bar grows by one small line at most. -->
		{#if hideGlobal && localLabel}
			<div class="text-xs leading-none text-black mb-1 select-none">{localLabel}</div>
		{:else}
			<div class="h-1"></div>
		{/if}
		<div class="flex items-start gap-2">
		<!-- Horizontal scroll wrapper for mobile; pointerdown only forfeits the one-shot
		     auto-scroll, it is not an interaction affordance -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			bind:this={scrollWrapper}
			onpointerdown={() => (hasAutoScrolled = true)}
			class="flex-1 min-w-0 overflow-x-auto max-[850px]:overflow-x-auto min-[851px]:overflow-x-visible relative max-[850px]:shadow-[inset_10px_0_10px_-10px_rgba(0,0,0,0.3),inset_-10px_0_10px_-10px_rgba(0,0,0,0.3)]"
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
		{#if onToggleLocal}
			<Button onclick={onToggleLocal} disabled={!localAvailable} aria-label={toggleLabel} class="p-1 shrink-0">
				<img src={toggleGlyph} alt="" width="24" height="24" />
			</Button>
		{/if}
		</div>
	</div>
{/if}
