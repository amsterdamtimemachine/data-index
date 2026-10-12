<!--
	The frame around the selected bin. Drawing only: the pointer passes through it to
	the track's bins, which select, drag and show the tooltip.
-->
<script lang="ts">
	interface Props {
		currentIndex: number;
		totalBins: number;
		timelineHeight: number;
	}
	let { currentIndex, totalBins, timelineHeight }: Props = $props();

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
</script>

<div
	class="absolute z-10 pointer-events-none bg-transparent border-[3px] border-atm-red-darkest"
	style="left: {thumbPosition}%; width: {thumbWidth}%; height: {timelineHeight}px; top: 0;"
	aria-hidden="true"
></div>
