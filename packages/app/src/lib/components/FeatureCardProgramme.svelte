<!-- A programme's content: expanded, its items in the source's order under a heading worded from them. -->
<script lang="ts">
	import type { FeatureResult } from '@atm/shared/types';
	import FieldList from '#lib/components/FieldList.svelte';
	import FeatureCardText from '#lib/components/FeatureCardText.svelte';
	import { programmeHeading, programmeRows } from '#lib/utils/cardFields.js';

	type Props = {
		feature: FeatureResult;
		expanded?: boolean;
	};
	let { feature, expanded = false }: Props = $props();

	const heading = $derived(programmeHeading(feature.entity));
	const rows = $derived.by(() => {
		if (!expanded) {
			return [];
		}
		return programmeRows(feature.entity);
	});
</script>

{#if rows.length > 0}
	{#if heading}
		<p class="px-2 pt-3 text-base text-gray-700">{heading}</p>
	{/if}
	<FieldList fields={rows} class="px-2 py-3" />
{/if}
{#if feature.description}
	<FeatureCardText text={feature.description} {expanded} />
{/if}
