<!--
	Every match of a search, listed under the collapsed card's content as "Gevonden via":
	the title, a snippet of a description or a diary's text, a field, a programme item.
	Expanded, every match is underlined in place, so nothing.
-->
<script lang="ts">
	import type { FeatureResult } from '@atm/shared/types';
	import FieldList from '#lib/components/FieldList.svelte';
	import { translate } from '#lib/utils/translations.js';
	import { foundByRows } from '#lib/utils/search-hits.js';

	type Props = {
		feature: FeatureResult;
		expanded?: boolean;
	};
	let { feature, expanded = false }: Props = $props();

	const rows = $derived(foundByRows(feature, expanded));
</script>

{#if rows.length > 0}
	<div class="pt-2">
		<p class="text-base italic text-gray-500">{translate('foundBy')}</p>
		<FieldList fields={rows} />
	</div>
{/if}
