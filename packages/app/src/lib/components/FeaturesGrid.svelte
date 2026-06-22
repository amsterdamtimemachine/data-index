<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import FeatureCard from '$components/FeatureCard.svelte';
	import { createMasonryMemoized, type MasonryMemoizedInstance } from '$utils/masonry';
	import debounce from 'lodash.debounce';
	import type { FeatureResult } from '@atm/shared/types';

	type Props = {
		features: FeatureResult[];
		columns?: number;
		layoutMemory?: Map<string, number>;
	};
	let { features, columns, layoutMemory }: Props = $props();

	// Use programmatic responsive columns if no explicit columns prop provided
	const useResponsiveColumns = $derived(columns === undefined);

	let masonryContainer = $state<HTMLElement>();
	let masonry: MasonryMemoizedInstance | null = null;
	let windowWidth = $state(0);

	// Calculate columns based on window width (updated breakpoints)
	function calculateColumns(width: number): number {
		if (width <= 650) return 1;
		if (width <= 1024) return 2;
		return 3;
	}

	// Get current column count
	let currentColumns = $derived(useResponsiveColumns ? calculateColumns(windowWidth) : columns || 3);

	// Debounced resize handler
	const debouncedResize = debounce(() => {
		if (useResponsiveColumns) {
			windowWidth = window.innerWidth;
		}
	}, 150);

	onMount(() => {
		// Initialize window width
		if (useResponsiveColumns) {
			windowWidth = window.innerWidth;
			window.addEventListener('resize', debouncedResize);
		}

		if (masonryContainer) {
			try {
				masonry = createMasonryMemoized(masonryContainer, {
					debounceDelay: 150,
					layoutMemory: layoutMemory || new Map()
				});
				// Initial layout
				masonry.layout(currentColumns, true);
			} catch (error) {
				console.error('Failed to initialize memoized masonry layout:', error);
			}
		}
	});

	onDestroy(() => {
		if (useResponsiveColumns) {
			window.removeEventListener('resize', debouncedResize);
		}
		masonry?.destroy();
	});

	// Re-layout when features or column count changes
	$effect(() => {
		if (masonry) {
			if (features.length > 0) {
				// Force layout when features change, use timeout for DOM updates
				setTimeout(() => masonry?.layout(currentColumns, true), 10);
			} else {
				// Just column count change, no force needed
				masonry.layout(currentColumns);
			}
		}
	});
</script>

<div class="w-full">
	{#if features.length === 0}
		<div class="text-gray-500 p-3">No features to display</div>
	{:else}
		<div
			class="masonry-layout p-3"
			bind:this={masonryContainer}
			style:grid-template-columns={`repeat(${currentColumns}, minmax(0, 1fr))`}
		>
			{#each Array(3) as _, columnIndex}
				<div class="masonry-column"></div>
			{/each}
			{#each features as feature, index (index)}
				<div class="masonry-item" data-feature-id={feature.id}>
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
