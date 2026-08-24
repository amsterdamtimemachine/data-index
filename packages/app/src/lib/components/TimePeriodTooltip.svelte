<script lang="ts">
	import type { HistogramBin } from '@atm/shared/types';

	type Props = {
		bin: HistogramBin;
		// the selected cell's count for this bin; null when no cell is selected
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
	<div class="font-medium text-atm-blue">{bin.count} {pluralised(bin.count)}</div>
	{#if localCount !== null}
		<div class="font-medium text-atm-red">{localCount} {pluralised(localCount)} in de cel</div>
	{/if}
	<div class="text-xs opacity-75">Periode: {bin.timeSlice.label}</div>
</div>
