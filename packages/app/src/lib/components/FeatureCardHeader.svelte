<script lang="ts">
	import type { FeatureResult } from '@atm/shared/types';
	import { mergeCss } from '$utils/utils';
	import { formatTimePeriod } from '$utils/format';
	import { translateContentType, translatePlaceType } from '$utils/translations';
	import Tag from './Tag.svelte';

	type Props = {
		feature: FeatureResult;
		class?: string;
	};

	let { feature, class: className }: Props = $props();
</script>

<div class={mergeCss('border-b border-atm-sand-border', className)}>
	<!-- Dataset and Record Type -->
	<div class="flex w-full flex-wrap justify-between items-center gap-2">
		<div class="flex flex-wrap items-center gap-2">
			<Tag variant="outline" class="flex-shrink-0">
				{translateContentType(feature.recordType)}
			</Tag>
			{#if feature.placeType}
				<Tag variant="outline" class="flex-shrink-0">
					{translatePlaceType(feature.placeType)}
				</Tag>
			{/if}
		</div>
		<span class="text-base text-black flex-shrink-0">
			{formatTimePeriod(feature.dateRange)}
		</span>
	</div>
</div>
