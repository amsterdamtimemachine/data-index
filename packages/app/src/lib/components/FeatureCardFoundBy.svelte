<!--
	The matches of a search the collapsed card does not show, listed under its content
	as "Gevonden via": a field it leaves out, a programme item, a passage of a diary's
	text outside the window. Expanded, every match is underlined in place, so nothing.
-->
<script lang="ts">
	import type { FeatureResult } from '@atm/shared/types';
	import FieldList from '#lib/components/FieldList.svelte';
	import { translate } from '#lib/utils/translations.js';
	import { hiddenHits } from '#lib/utils/search-hits.js';

	type Props = {
		feature: FeatureResult;
		expanded?: boolean;
	};
	let { feature, expanded = false }: Props = $props();

	const rows = $derived(hiddenHits(feature, expanded));
</script>

{#if rows.length > 0}
	<div class="pt-2">
		<p class="text-base italic text-gray-500">{translate('foundBy')}</p>
		<FieldList fields={rows} />
	</div>
{/if}
