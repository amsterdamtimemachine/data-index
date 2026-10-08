<!--
	A card's top row: the dataset the item comes from, linked to the item's record
	there and truncated to the room it has; the item's years; and the button that
	opens a collapsed card or closes an expanded one.
-->
<script lang="ts">
	import type { FeatureResult } from '@atm/shared/types';
	import { mergeCss } from '$utils/utils';
	import { formatTimePeriod, formatDatasetTitle } from '$utils/format';
	import Link from './Link.svelte';
	import Button from './Button.svelte';
	import ArrowsOut from 'phosphor-svelte/lib/ArrowsOut';
	import X from 'phosphor-svelte/lib/X';

	type Props = {
		feature: FeatureResult;
		class?: string;
		onExpand?: () => void;
		onClose?: () => void;
	};

	let { feature, class: className, onExpand, onClose }: Props = $props();

	// the dataset's name; its provider's when the dataset has none
	const sourceName = $derived.by(() => {
		if (feature.datasetLabel) {
			return formatDatasetTitle(feature.datasetLabel);
		}
		return feature.providerLabel ?? '';
	});
</script>

<div class={mergeCss('border-b border-atm-sand-border flex w-full justify-between items-center gap-2 min-h-[32px]', className)}>
	<div class="min-w-0 flex-1">
		{#if feature.url}
			<Link href={feature.url} target="_blank" rel="noopener noreferrer" class="block truncate">{sourceName}</Link>
		{:else}
			<span class="block truncate text-base text-black">{sourceName}</span>
		{/if}
	</div>
	<div class="flex items-center gap-2 flex-shrink-0">
		<span class="text-base text-black">{formatTimePeriod(feature.dateRange)}</span>
		{#if onExpand}
			<Button onclick={onExpand} icon={ArrowsOut} aria-label="View feature details" />
		{/if}
		{#if onClose}
			<Button onclick={onClose} icon={X} aria-label="Close feature detail viewer" />
		{/if}
	</div>
</div>
