<script lang="ts">
	import type { HistogramBin } from '@atm/shared/types';
	import { translate } from '$utils/translations';
	import DataTooltip from '$components/DataTooltip.svelte';

	type Props = {
		bin: HistogramBin;
		// the selection's count for this bin while its series is the one on screen;
		// null while the city-wide series shows
		localCount: number | null;
		// the selection's count for this bin under the city-wide series; null without data
		selectionCount?: number | null;
		x: number;
		y: number;
	};
	let { bin, localCount, selectionCount = null, x, y }: Props = $props();

	function pluralised(count: number): string {
		if (count === 1) {
			return translate('featureOne');
		}
		return translate('featureMany');
	}
</script>

{#snippet selectionLine(count: number)}
	<div class="font-medium text-atm-red">{count} {pluralised(count)} {translate('inSelection')}</div>
{/snippet}

<DataTooltip {x} {y}>
	{#if localCount !== null}
		{@render selectionLine(localCount)}
	{:else}
		<div class="font-medium text-atm-blue">{bin.count} {pluralised(bin.count)}</div>
		{#if selectionCount !== null}
			{@render selectionLine(selectionCount)}
		{/if}
	{/if}
	<div class="text-xs opacity-75">{translate('periodLabel')}: {bin.timeSlice.label}</div>
</DataTooltip>
