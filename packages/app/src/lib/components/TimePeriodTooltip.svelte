<script lang="ts">
	import type { HistogramBin } from '@atm/shared/types';

	type Props = {
		bin: HistogramBin;
		// the selection's count for this bin while its series is the one on screen;
		// null while the city-wide series shows
		localCount: number | null;
		x: number;
		y: number;
	};
	let { bin, localCount, x, y }: Props = $props();

	function pluralised(count: number): string {
		if (count === 1) {
			return 'feature';
		}
		return 'features';
	}
</script>

<div
	class="fixed z-50 bg-black bg-opacity-80 text-white px-2 py-1 rounded text-sm pointer-events-none transform -translate-x-1/2 -translate-y-full"
	style="left: {x}px; top: {y - 8}px;"
>
	{#if localCount !== null}
		<div class="font-medium text-atm-red">{localCount} {pluralised(localCount)} in de cel</div>
	{:else}
		<div class="font-medium text-atm-blue">{bin.count} {pluralised(bin.count)}</div>
	{/if}
	<div class="text-xs opacity-75">Periode: {bin.timeSlice.label}</div>
</div>
