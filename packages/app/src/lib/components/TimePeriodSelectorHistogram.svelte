<script lang="ts">
	import type { HistogramBin } from '@atm/shared/types';
	import { calculateHistogramBarHeights } from '$lib/utils/histogram';

	interface Props {
		bins: HistogramBin[];
		maxCount: number;
		// the selected cell's series, drawn in its own band
		localBins?: HistogramBin[];
		localMaxCount?: number;
		timelineHeight: number;
		// band layout, computed once by the selector
		bandHeight: number;
		stacked: boolean;
		hideGlobal: boolean;
	}
	let {
		bins,
		maxCount,
		localBins = [],
		localMaxCount = 0,
		timelineHeight,
		bandHeight,
		stacked,
		hideGlobal
	}: Props = $props();

	// the local band's floor: mid-track when stacked, the track line otherwise
	const localBase = $derived.by(() => {
		if (stacked) {
			return bandHeight;
		}
		return timelineHeight;
	});

	// Each series is normalised to its own max (log scaling); heights are not
	// comparable across series — the hover carries the absolute counts.
	const barHeights = $derived.by(() => {
		if (bins.length === 0) {
			return [];
		}
		return calculateHistogramBarHeights(bins, maxCount, bandHeight, 1);
	});
	const localBarHeights = $derived.by(() => {
		if (localBins.length === 0) {
			return [];
		}
		return calculateHistogramBarHeights(localBins, localMaxCount, bandHeight, 1);
	});

	// nudge the outermost ticks inward so they stay visible at the edges
	function tickTransform(i: number): string {
		if (i === 0) {
			return 'translate(0.5, 0)';
		}
		if (i === bins.length) {
			return 'translate(-0.5, 0)';
		}
		return '';
	}
</script>

<svg class="absolute top-0 w-full h-full">
	<!-- Global bars -->
	{#if !hideGlobal}
		{#each bins as bin, i (bin.timeSlice.key)}
			{@const barWidth = 100 / bins.length}
			{@const barHeight = barHeights[i]}
			{@const x = (i / bins.length) * 100}
			<rect
				x="{x}%"
				y={timelineHeight - barHeight}
				width="{barWidth}%"
				height={barHeight}
				class="fill-atm-blue"
			></rect>
		{/each}
	{/if}

	<!-- Selected cell's bars: own band above the global one on desktop -->
	{#each localBins as bin, i (bin.timeSlice.key)}
		{@const barWidth = 100 / localBins.length}
		{@const barHeight = localBarHeights[i]}
		{@const x = (i / localBins.length) * 100}
		<rect
			x="{x}%"
			y={localBase - barHeight}
			width="{barWidth}%"
			height={barHeight}
			class="fill-atm-red"
		></rect>
	{/each}

	<!-- floor of the selection band -->
	{#if stacked}
		<line x1="0%" y1={localBase} x2="100%" y2={localBase} stroke="black" stroke-width="0.5" />
	{/if}

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
			transform={tickTransform(i)}
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
