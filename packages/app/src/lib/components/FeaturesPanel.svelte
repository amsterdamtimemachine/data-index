<script lang="ts">
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import FeaturesGrid from '$components/FeaturesGrid.svelte';
	import Pagination from '$components/Pagination.svelte';
	import FeaturesCount from '$components/FeaturesCount.svelte';
	import Button from '$components/Button.svelte';
	import Tooltip from '$components/Tooltip.svelte';
	import X from 'phosphor-svelte/lib/X';
	import QuestionMark from 'phosphor-svelte/lib/QuestionMark';
	import { formatDate } from '$utils/utils';
	import type { FeatureResult } from '@atm/shared/types';
	import { loadingState } from '$lib/state/loadingState.svelte';
	import { createError, createPageErrorData } from '$utils/error';
	import ErrorHandler from '$components/ErrorHandler.svelte';
	import type { RecordType } from '@atm/shared/types';
	import type { AppError } from '$types/error';

	interface Props {
		cellId: string;
		period: string;
		bounds?: { minLat: number; maxLat: number; minLon: number; maxLon: number };
		recordTypes: RecordType[];
		tags: string[];
		tagOperator?: 'AND' | 'OR';
		onClose?: () => void;
	}

	let { cellId, period, bounds, recordTypes, tags, tagOperator = 'OR', onClose }: Props = $props();

	// Cell data state
	let allFeatures = $state<FeatureResult[]>([]);
	let currentPage = $state(1);
	let totalCount = $state(0);
	let pageSize = $state(100); // From API response
	let loading = $state(false);
	let initialLoading = $state(true);
	let errors = $state<AppError[]>([]);
	let errorData = $derived(createPageErrorData(errors));

	// Layout memory for stable masonry across pagination
	let layoutMemory = new Map<string, number>(); // featureId -> columnIndex
	let currentContext = $state(''); // Track current data context

	/**
	 * Clear layout memory when data context changes
	 */
	function clearLayoutMemory() {
		layoutMemory.clear();
	}

	async function loadCellData(page: number = 1) {
		loading = true;
		loadingState.startLoading();

		try {
			if (!bounds) {
				throw new Error('No bounds available for this cell');
			}

			// Parse period to get time slice key
			const timeSlice = period;

			// Build URL for local /api/features endpoint
			const params = new URLSearchParams({
				minLon: bounds.minLon.toString(),
				maxLon: bounds.maxLon.toString(),
				minLat: bounds.minLat.toString(),
				maxLat: bounds.maxLat.toString(),
				page: page.toString(),
				timeSlice,
				tagOperator
			});

			if (recordTypes.length > 0) {
				params.set('recordTypes', recordTypes.join(','));
			}
			if (tags.length > 0) {
				params.set('tags', tags.join(','));
			}

			const response = await fetch(`/api/features?${params}`);
			if (!response.ok) {
				throw new Error(`HTTP ${response.status}`);
			}

			const data = await response.json();

			allFeatures = data.data || [];
			currentPage = data.page || 1;
			totalCount = data.total || 0;
			pageSize = data.pageSize || 50;

			errors = [];
		} catch (err) {
			console.error('Error loading cell data:', err);
			errors = [
				createError(
					'error',
					'Cell Data Load Failed',
					err instanceof Error ? err.message : 'Failed to load cell data',
					{ cellId, period, page, recordTypes, tags }
				)
			];
		} finally {
			loading = false;
			loadingState.stopLoading();
		}
	}

	function handlePageChange(newPage: number) {
		if (loading) return; // Prevent multiple concurrent requests
		loadCellData(newPage);
	}

	// Detect context changes and clear memory when needed
	$effect(() => {
		// Create context key from always-available props
		const newContext = `${cellId}_${period}`;

		if (currentContext !== newContext) {
			// console.log('🔄 Context changed:', { from: currentContext, to: newContext });
			clearLayoutMemory();
			currentContext = newContext;
		}
	});

	$effect(() => {
		// Reset state when cellId or period changes
		allFeatures = [];
		currentPage = 1;
		totalCount = 0;
		pageSize = 100;
		errors = [];
		initialLoading = true;

		// Load new data
		loadCellData(1).finally(() => {
			initialLoading = false;
		});
	});

	function closeModal() {
		if (onClose) {
			onClose();
		}
	}
</script>

<ErrorHandler {errorData} />

<!-- Data Header -->
<div
	class="sticky h-[50px] p-3 top-0 z-10 bg-atm-sand border-b border-atm-sand-border flex items-center justify-between shadow-[0px_5px_20px_5px_rgba(0,0,0,0.07)]"
>
	<div class="flex items-center gap-4">
		{#if !initialLoading && totalCount > 0}
			<FeaturesCount totalFeatures={totalCount} {currentPage} featuresPerPage={pageSize} />
			{#if totalCount > pageSize}
				<Pagination
					totalItems={totalCount}
					{currentPage}
					itemsPerPage={pageSize}
					onPageChange={handlePageChange}
					{loading}
				/>
			{/if}
		{/if}
	</div>
	<Button icon={X} onclick={closeModal} size={18} aria-label="Close features panel" />
</div>

<div class="min-h-full bg-atm-sand-dark">
	{#if allFeatures.length > 0}
		<FeaturesGrid features={allFeatures} {layoutMemory} />
	{:else if !initialLoading && !loading}
		<div class="text-base text-gray-500 p-4">No features found for this cell and period</div>
	{/if}
</div>
