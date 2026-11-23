<!-- The content of a feature that has nothing but its description to show. -->
<script lang="ts">
	import type { FeatureResult } from '@atm/shared/types';
	import FeatureCardText from '#lib/components/FeatureCardText.svelte';

	type Props = {
		feature: FeatureResult;
		expanded?: boolean;
	};
	let { feature, expanded = false }: Props = $props();
</script>

{#if feature.description}
	<FeatureCardText text={feature.description} {expanded} />
{/if}
