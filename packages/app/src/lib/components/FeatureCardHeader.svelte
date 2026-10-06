<script lang="ts">
	import type { FeatureResult } from '@atm/shared/types';
	import { mergeCss } from '$utils/utils';
	import { formatTimePeriod } from '$utils/format';
	import { translate } from '$utils/translations';
	import { entityKind } from '$utils/cardFields';
	import Tag from './Tag.svelte';
	import Link from './Link.svelte';
	import Button from './Button.svelte';
	import ArrowsOut from 'phosphor-svelte/lib/ArrowsOut';

	type Props = {
		feature: FeatureResult;
		class?: string;
		expanded?: boolean;
		onExpand?: () => void;
	};

	let { feature, class: className, expanded = false, onExpand }: Props = $props();

	// the record type, with the entity's subtype in brackets where it has one:
	// "Evenement (Bioscoop)". Filters know the type only, so the word stays theirs.
	const typeLabel = $derived.by(() => {
		const kind = entityKind(feature.entity);
		if (kind) {
			return `${translate(feature.recordType)} (${translate(kind)})`;
		}
		return translate(feature.recordType);
	});
</script>

<div class={mergeCss('border-b border-atm-sand-border', className)}>
	<!-- Dataset and Record Type -->
	<div class="flex w-full flex-wrap justify-between items-center gap-2">
		<div class="flex flex-wrap items-center gap-2">
			<!-- Record type — links to the feature's source record when it has one -->
			{#if feature.url}
				<Link href={feature.url} target="_blank" rel="noopener noreferrer" class="no-underline flex-shrink-0">
					<Tag variant="link" interactive>{typeLabel}</Tag>
				</Link>
			{:else}
				<Tag variant="outline" class="flex-shrink-0">{typeLabel}</Tag>
			{/if}
			<!-- Place type — links to the place's source record when it has one -->
			{#if feature.placeType}
				{#if feature.placeUrl}
					<Link href={feature.placeUrl} target="_blank" rel="noopener noreferrer" class="no-underline flex-shrink-0">
						<Tag variant="link" interactive>{translate(feature.placeType)}</Tag>
					</Link>
				{:else}
					<Tag variant="outline" class="flex-shrink-0">{translate(feature.placeType)}</Tag>
				{/if}
			{/if}
		</div>
		<div class="flex items-center gap-2 flex-shrink-0">
			<span class="text-base text-black">
				{formatTimePeriod(feature.dateRange)}
			</span>
			{#if !expanded && onExpand}
				<Button onclick={onExpand} icon={ArrowsOut} aria-label="View feature details" />
			{/if}
		</div>
	</div>
</div>
