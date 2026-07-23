<script lang="ts">
	import type { FeatureResult } from '@atm/shared/types';
	import ArrowsOut from 'phosphor-svelte/lib/ArrowsOut';
	import { formatDatasetTitle } from '$utils/format';
	import { mergeCss } from '$utils/utils';
	import Button from '$components/Button.svelte';
	import Link from '$components/Link.svelte';

	type Props = {
		feature: FeatureResult;
		class?: string;
		onExpand: () => void;
		expanded?: boolean;
	};

	let { feature, class: className, onExpand, expanded = false }: Props = $props();
</script>

<div
	class={mergeCss(
		expanded ? 'py-2' : 'py-1',
		'px-2 flex justify-between items-center border-t border-atm-sand-border',
		className
	)}
>
	<div class="flex items-center gap-2 text-base">
		{#if expanded && feature.organisationLabel && feature.organisationUrl}
			<Link href={feature.organisationUrl} target="_blank" rel="noopener noreferrer">
				{feature.organisationLabel}
			</Link>
			<span class="text-gray-400">›</span>
		{/if}
		{#if feature.url}
			<Link href={feature.url} target="_blank" rel="noopener noreferrer">
				{feature.datasetLabel ? formatDatasetTitle(feature.datasetLabel) : 'Source'} →
			</Link>
		{/if}
	</div>

	{#if !expanded}
		<Button onclick={onExpand} icon={ArrowsOut} aria-label="View feature details">Expand</Button>
	{/if}
</div>
