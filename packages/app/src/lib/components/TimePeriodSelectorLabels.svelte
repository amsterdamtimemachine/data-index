<script lang="ts">
	interface Props {
		displayPeriods: string[];
		timelineHeight: number;
	}
	let { displayPeriods, timelineHeight }: Props = $props();

	function labelFor(period: string, i: number): string {
		if (i === displayPeriods.length - 1) {
			return 'Nu';
		}
		return period;
	}

	function anchorFor(i: number): string {
		if (i === 0) {
			return 'start';
		}
		if (i === displayPeriods.length - 1) {
			return 'end';
		}
		return 'middle';
	}
</script>

<svg class="absolute w-full h-full pointer-events-none">
	<!-- Year labels -->
	{#each displayPeriods as period, i}
		{@const position = (i / (displayPeriods.length - 1)) * 100}
		<text
			x="{position}%"
			y={timelineHeight + 18}
			fill="black"
			text-anchor={anchorFor(i)}
			class="font-medium text-base"
		>
			{labelFor(period, i)}
		</text>
	{/each}
</svg>
