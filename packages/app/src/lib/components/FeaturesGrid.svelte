<script lang="ts">
	import { onMount, onDestroy, untrack } from 'svelte';
	import FeatureCard from '$components/FeatureCard.svelte';
	import { createMasonry, type MasonryInstance } from '$utils/masonry';
	import debounce from 'lodash.debounce';
	import type { FeatureResult } from '@atm/shared/types';

	type Props = {
		features: FeatureResult[];
		columns?: number;
	};
	let { features, columns }: Props = $props();

	// Also the number of column divs rendered below — a columns prop above this is capped.
	// Sized for the widest desktop the resize handle can request (:empty divs cost nothing).
	const MAX_COLUMNS = 8;

	const useResponsiveColumns = $derived(columns === undefined);

	let masonryContainer = $state<HTMLElement>();
	let masonry = $state<MasonryInstance | null>(null);
	let windowWidth = $state(0);
	// Container stays invisible (but measurable) until the first layout has placed items,
	// so there is no flash of the un-columned grid.
	let ready = $state(false);

	function calculateColumns(width: number): number {
		if (width <= 650) return 1;
		if (width <= 1024) return 2;
		return 3;
	}

	const currentColumns = $derived.by(() => {
		if (useResponsiveColumns) {
			return calculateColumns(windowWidth);
		}
		return Math.min(columns || 3, MAX_COLUMNS);
	});

	const debouncedResize = debounce(() => {
		windowWidth = window.innerWidth;
	}, 150);

	onMount(() => {
		windowWidth = window.innerWidth;
	});

	// (Re)create the masonry instance whenever the container element (re)appears.
	$effect(() => {
		if (!masonryContainer) return;
		const instance = createMasonry(masonryContainer);
		masonry = instance;
		return () => {
			instance.destroy();
			masonry = null;
			ready = false;
		};
	});

	// Re-layout on feature or column changes. Runs post-flush, so the items are in the
	// DOM; image space is reserved via aspect-ratio, so heights are already final.
	let lastFeatures: FeatureResult[] | null = null;
	$effect(() => {
		const instance = masonry;
		const list = features;
		const cols = currentColumns;
		if (!instance) return;
		untrack(() => {
			instance.layout(cols, list !== lastFeatures);
			lastFeatures = list;
			ready = true;
		});
	});

	onDestroy(() => debouncedResize.cancel());
</script>

<svelte:window onresize={debouncedResize} />

<div class="w-full">
	{#if features.length === 0}
		<div class="text-gray-500 p-3">No features to display</div>
	{:else}
		<div
			class="masonry-layout p-3"
			class:invisible={!ready}
			bind:this={masonryContainer}
			style:grid-template-columns={`repeat(${currentColumns}, minmax(0, 1fr))`}
		>
			{#each Array(MAX_COLUMNS) as _, columnIndex}
				<div class="masonry-column"></div>
			{/each}
			{#each features as feature, index (index)}
				<div class="masonry-item" data-index={index} data-feature-id={feature.id}>
					<FeatureCard {feature} />
				</div>
			{/each}
		</div>
	{/if}
</div>

<style>
	.masonry-layout {
		/* grid-template-columns set dynamically via inline style */
		display: grid;
		gap: 1rem;
		width: 100%;
		max-width: 100%;
		overflow-x: hidden;
	}

	.masonry-column {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		min-width: 0; /* Allow columns to shrink below content size */
	}

	.masonry-column:empty {
		display: none;
	}

	.masonry-item {
		break-inside: avoid;
		display: flex;
		position: relative;
		width: 100%;
		min-width: 0; /* Allow items to shrink below content size */
	}
</style>
