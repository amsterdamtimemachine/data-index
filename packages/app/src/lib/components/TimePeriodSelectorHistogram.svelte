<script lang="ts">
	import type { HistogramBin } from '@atm/shared/types';
	import { calculateHistogramBarHeights } from '$lib/utils/histogram';
	import TimePeriodSelectorMarker from '$components/TimePeriodSelectorMarker.svelte';

	interface Props {
		bins: HistogramBin[];
		maxCount: number;
		// the selected cell's or place's series, shown instead of the global one
		localBins?: HistogramBin[];
		localMaxCount?: number;
		// the selection's series while the global bars show: a dot marks each bin
		// where it has data, a hint of where a switch to the selection pays off
		markerBins?: HistogramBin[];
		timelineHeight: number;
		hideGlobal: boolean;
	}
	let {
		bins,
		maxCount,
		localBins = [],
		localMaxCount = 0,
		markerBins = [],
		timelineHeight,
		hideGlobal
	}: Props = $props();

	// matched by bin key: both series come from the same bin configuration
	const markedKeys = $derived(new Set(markerBins.filter((bin) => bin.count > 0).map((bin) => bin.timeSlice.key)));

	// Each series is normalised to its own max (log scaling); the hover carries
	// the absolute counts.
	const barHeights = $derived.by(() => {
		if (bins.length === 0) {
			return [];
		}
		return calculateHistogramBarHeights(bins, maxCount, timelineHeight, 1);
	});
	const localBarHeights = $derived.by(() => {
		if (localBins.length === 0) {
			return [];
		}
		return calculateHistogramBarHeights(localBins, localMaxCount, timelineHeight, 1);
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

	<!-- The selection's bars, in place of the global ones -->
	{#each localBins as bin, i (bin.timeSlice.key)}
		{@const barWidth = 100 / localBins.length}
		{@const barHeight = localBarHeights[i]}
		{@const x = (i / localBins.length) * 100}
		<rect
			x="{x}%"
			y={timelineHeight - barHeight}
			width="{barWidth}%"
			height={barHeight}
			class="fill-atm-red"
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

	<!-- The selection's markers, on the baseline under the global bars -->
	{#if !hideGlobal}
		{#each bins as bin, i (bin.timeSlice.key)}
			{#if markedKeys.has(bin.timeSlice.key)}
				<TimePeriodSelectorMarker cx="{((i + 0.5) / bins.length) * 100}%" cy={timelineHeight} />
			{/if}
		{/each}
	{/if}
</svg>
