<!-- (map)/+page.svelte -->
<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { onNavigate, afterNavigate } from '$app/navigation';
	import { goto } from '$app/navigation';
	import { createStateController } from '$state/StateController.svelte';
	import { createPageErrorData } from '$utils/error';
	import { mergeHeatmapTimeline, mergeHeatmaps, getCellBoundsFromCellId } from '$utils/heatmap';
	import { mergeHistograms } from '$utils/histogram';
	import { translateContentTypes, reverseTranslateContentTypes } from '$utils/translations';
	import { loadingState } from '$lib/state/loadingState.svelte';
	import QuestionMark from 'phosphor-svelte/lib/QuestionMark';
	import Heading from '$components/Heading.svelte';
	import Map from '$components/Map.svelte';
	import TimePeriodSelector from '$components/TimePeriodSelector.svelte';
	import ToggleGroup from '$components/ToggleGroup.svelte';
	import TagsANDSelector from '$components/TagsANDSelector.svelte';
	import Tag from '$components/Tag.svelte';
	import Tooltip from '$components/Tooltip.svelte';
	import TagOperatorSwitch from '$components/TagOperatorSwitch.svelte';
	import DummyTagsSection from '$components/DummyTagsSection.svelte';
	import FeaturesPanel from '$components/FeaturesPanel.svelte';
	import NavContainer from '$components/NavContainer.svelte';
	import FiltersStatusPanel from '$components/FiltersStatusPanel.svelte';
	import ErrorHandler from '$components/ErrorHandler.svelte';
	import FeatureDetailModal from '$components/FeatureDetailModal.svelte';
	import Nav from '$components/Nav.svelte';
	import NavItem from '$components/NavItem.svelte';
	import type { PageData } from './$types';
import type { HeatmapTimelineApiResponse, HistogramApiResponse, HeatmapTimeline } from '@atm/shared/types';
import { PUBLIC_DEFAULT_CELL } from '$env/static/public';

	let { data }: { data: PageData } = $props();

	// Derived data from server
	let dimensions = $derived(data?.metadata?.heatmapDimensions);
	let recordTypes = $derived(data?.metadata?.recordTypes || []);
	let tags = $derived(data?.metadata?.tags);
	let availableTagNames = $derived(
		data?.availableTags?.tags?.map((tag: { name: string }) => tag.name) || data?.metadata?.tags || []
	);
	let heatmapTimeline = $derived((data?.heatmapTimeline as HeatmapTimelineApiResponse | null)?.heatmapTimeline);

	// Create lightweight blueprint metadata from dimensions for client-side calculation
	let blueprintMetadata = $derived.by(() => {
		if (!dimensions) return null;
		return {
			rows: dimensions.rowsAmount,
			cols: dimensions.colsAmount,
			bounds: {
				minLon: dimensions.minLon,
				maxLon: dimensions.maxLon,
				minLat: dimensions.minLat,
				maxLat: dimensions.maxLat
			}
		};
	});

	let currentRecordTypes = $derived(data?.currentRecordTypes || []);
	let currentTags = $derived(data?.currentTags || []);
	let currentTagOperator = $derived(data?.currentTagOperator || 'OR');
	let validatedCell = $derived(data?.validatedCell);
	let validatedCellBounds = $derived(data?.cellBounds);
	let validatedPeriod = $derived(data?.validatedPeriod);
	let histograms = $derived((data?.histogram as HistogramApiResponse | null)?.histograms);

	// Translated content types for UI display  
	let translatedRecordTypes = $derived(recordTypes ? translateContentTypes(recordTypes) : []);
	let translatedCurrentRecordTypes = $derived(currentRecordTypes ? translateContentTypes(currentRecordTypes) : []);

	const controller = createStateController();
	let currentPeriod = $derived(controller.currentPeriod);
	let selectedCellId = $derived(controller.selectedCellId);
	let selectedCellBounds = $derived(controller.selectedCellBounds);
	let showCellModal = $derived(controller.showCellModal);

	// Navigation state
	let navExpanded = $state(true);
	
	// Feature flag for tags - set to false until tags data is ready
	const TAGS_FEATURE_READY = false;
	

	// Combine server errors with controller errors for ErrorHandler
	let allErrors = $derived.by(() => {
		const serverErrors = data.errorData?.errors || [];
		const controllerErrors = controller.errors || [];
		return createPageErrorData([...serverErrors, ...controllerErrors]);
	});

	let mergedHeatmapTimeline = $derived.by(() => {
		if (heatmapTimeline && currentRecordTypes && recordTypes) {
			const timelineData = heatmapTimeline?.heatmapTimeline || heatmapTimeline;

			const needsMerging =
				currentRecordTypes.length > 1 || (currentTags && currentTags.length > 0);

			// TODO: Re-enable client-side merging when tags are used again
			// Server now handles record type merging automatically when recordTypes.length > 1
			// if (needsMerging) {
			// 	// For OR operations with multiple tags, server already merged - just merge recordTypes if needed
			// 	if (currentTagOperator === 'OR' && currentTags && currentTags.length > 1) {
			// 		// OR operations: server already merged tags into base heatmaps, only merge recordTypes if needed
			// 		if (currentRecordTypes.length > 1) {
			// 			return mergeHeatmapTimeline(
			// 				timelineData as unknown as HeatmapTimeline,
			// 				currentRecordTypes,
			// 				undefined, // Don't pass tags - use base heatmaps
			// 				data?.metadata?.heatmapBlueprint
			// 			);
			// 		} else {
			// 			// Single recordType with OR tags - use as-is (server already merged)
			// 			return timelineData;
			// 		}
			// 	} else {
			// 		// AND operations or single tag - use original client-side merging logic
			// 		const selectedTags = currentTags && currentTags.length > 0 ? currentTags : undefined;
			// 		return mergeHeatmapTimeline(
			// 			timelineData as unknown as HeatmapTimeline,
			// 			currentRecordTypes,
			// 			selectedTags,
			// 			data?.metadata?.heatmapBlueprint
			// 		);
			// 	}
			// } else {
			// 	// Single recordType, no tags - use original timeline
			// 	return timelineData;
			// }
			
			// Use server data directly (server handles merging when needed)
			return timelineData;
		}
		return null;
	});

	let mergedHistogram = $derived.by(() => {
		if (histograms && currentRecordTypes && recordTypes) {
			// Determine selected tags if any
			const selectedTags = currentTags && currentTags.length > 0 ? currentTags : undefined;

			// Collect histograms to merge
			const histogramsToMerge = [];

			for (const recordType of currentRecordTypes) {
				const recordTypeData = histograms[recordType];
				if (recordTypeData) {
					// For OR operations with multiple tags, server already merged - use base histograms
					if (currentTagOperator === 'OR' && selectedTags && selectedTags.length > 1) {
						// OR operations: server already merged tags into base histograms
						if (recordTypeData.base) {
							histogramsToMerge.push(recordTypeData.base);
						}
					} else if (selectedTags && selectedTags.length > 0) {
						// AND operations or single tag - use original logic
						const tagKey =
							selectedTags.length > 1 ? selectedTags.sort().join('+') : selectedTags[0];
						if (recordTypeData.tags[tagKey]) {
							histogramsToMerge.push(recordTypeData.tags[tagKey]);
						}
					} else if (recordTypeData.base) {
						// Use base histogram
						histogramsToMerge.push(recordTypeData.base);
					}
				}
			}

			if (histogramsToMerge.length === 0) {
				return null;
			}

			// Merge histograms on client side
			return mergeHistograms(histogramsToMerge);
		}
		return null;
	});

	let currentHeatmap = $derived.by(() => {
		if (mergedHeatmapTimeline && currentPeriod) {
			const timeSliceData = (mergedHeatmapTimeline as any)[currentPeriod];
			if (timeSliceData) {
				const mergedKey = Object.keys(timeSliceData)[0];
				return timeSliceData[mergedKey]?.base || null;
			}
		}

		// Return empty sparse heatmap when no data exists for this period
		// This keeps the map visible with all cells at 0 density
		if (blueprintMetadata) {
			return {
				indices: [],
				counts: [],
				densities: [],
				dimensions: {
					rows: blueprintMetadata.rows,
					cols: blueprintMetadata.cols
				}
			};
		}

		return null;
	});

	onMount(() => {
		// Initialize controller with server-validated period
		const initialPeriod = validatedPeriod || '';
		controller.initialize(initialPeriod);

		// Handle server-validated cell from URL parameter
		tick().then(() => {
			if (validatedCell && validatedCellBounds) {
				// Use server-validated cell data
				controller.selectCell(validatedCell, validatedCellBounds);
			}

			// Set URL defaults if no parameters exist
			const hasUrlParams = window.location.search.length > 0;
			if (!hasUrlParams && heatmapTimeline && recordTypes.length > 0) {
				// Get the actual last period from raw dataset (not filtered data)
				const allPeriods = Object.keys(heatmapTimeline);
				const lastPeriod = allPeriods.length > 0 ? allPeriods[allPeriods.length - 1] : '';
				const defaultRecordTypes = currentRecordTypes.length > 0 ? currentRecordTypes : recordTypes;
				
				if (lastPeriod && defaultRecordTypes.length > 0) {
					controller.syncUrlParameters(lastPeriod, currentTagOperator, defaultRecordTypes);

					// Set default cell selection
					if (PUBLIC_DEFAULT_CELL && blueprintMetadata) {
						// Calculate bounds on-demand instead of looking up in blueprint
						const bounds = getCellBoundsFromCellId(PUBLIC_DEFAULT_CELL, blueprintMetadata);
						if (bounds) {
							controller.selectCell(PUBLIC_DEFAULT_CELL, bounds);
						}
					}
				}
			}
		});
	});


	function handlePeriodChange(period: string) {
		controller.updatePeriod(period);
		controller.updateUrlParam('period', period);
	}

	function handleRecordTypeChange(recordTypes: string[] | string) {
		// Translate Dutch labels back to English for API/URL  
		const dutchArray = Array.isArray(recordTypes) ? recordTypes : [recordTypes];
		const englishArray = reverseTranslateContentTypes(dutchArray);
		
		const url = new URL(window.location.href);
		if (englishArray.length > 0) {
			url.searchParams.set('recordTypes', englishArray.join(','));
		} else {
			url.searchParams.delete('recordTypes');
		}
		url.searchParams.delete('tags'); // resetTags
		goto(url.pathname + url.search);
	}

	function handleTagsChange(tags: string | string[]) {
		const tagArray = Array.isArray(tags) ? tags : [tags];
		const url = new URL(window.location.href);
		if (tagArray.length > 0) {
			url.searchParams.set('tags', tagArray.join(','));
		} else {
			url.searchParams.delete('tags');
		}
		goto(url.pathname + url.search);
	 }

	function handleTagOperatorChange(operator: 'AND' | 'OR') {
		// Update local state immediately for UI responsiveness
		currentTagOperator = operator;
		currentTags = []; // Reset tags immediately
		
		// Always navigate to ensure tags are reset and fresh data is fetched
		const url = new URL(window.location.href);
		url.searchParams.set('tagOperator', operator);
		url.searchParams.delete('tags'); // resetTags
		goto(url.pathname + url.search);
	}

	// Handle cell selection from map
	function handleCellClick(cellId: string | null) {
		if (cellId && blueprintMetadata) {
			// Calculate bounds on-demand instead of looking up in blueprint
			const bounds = getCellBoundsFromCellId(cellId, blueprintMetadata);
			if (bounds) {
				controller.selectCell(cellId, bounds);
			} else {
				controller.selectCell(cellId);
			}
		} else {
			controller.selectCell(null);
		}
	}

	function handleFeaturesPanelClose() {
		controller.clearErrors();
		controller.selectCell(null);
	}
</script>

<ErrorHandler errorData={allErrors} />

<div class="relative flex flex-col w-screen h-screen">
	<div class="relative flex-1">
		{#if currentHeatmap && blueprintMetadata && dimensions}
			<Map
				heatmap={currentHeatmap}
				{blueprintMetadata}
				{dimensions}
				{selectedCellId}
				{handleCellClick}
			/>
		{/if}

		<NavContainer bind:isExpanded={navExpanded} class="absolute top-0 left-0 z-30">
			<Nav class="p-3">
				<NavItem href="/about" label="Over" />
			</Nav>
			<div class="p-3">
					
				<div class="mb-4">
						<Heading level={2} class="font-bold text-lg mb-2"> Filters </Heading>

					<div class="flex mb-2">
						<Heading level={3} class="pr-2"> Inhoudstype </Heading>
						<Tooltip icon={QuestionMark} text="De data index bevat een selectie van afbeeldingen, persoonsdata en teksten uit Nederlandse kranten." placement="bottom" />
					</div>
					<ToggleGroup
						items={translatedRecordTypes}
						selectedItems={translatedCurrentRecordTypes}
						onItemSelected={handleRecordTypeChange}
						requireOneItemSelected={true}>
						{#snippet children(item, isSelected, isDisabled)}
							<Tag variant={isSelected ? 'selected-outline' : 'outline'} disabled={isDisabled} interactive={true}>
								{item}
							</Tag>
						{/snippet}
					</ToggleGroup>
				</div>

				<!-- Topics Section - Use dummy version until tags data is ready -->
				{#if TAGS_FEATURE_READY}
					<!-- Real tags implementation - disabled for now -->
					<div class="mb-4">
						<div class="flex">
							<Heading level={3} class="pr-2"> Onderwerpen </Heading>
							<Tooltip icon={QuestionMark} text="Thematic categories based on newspaper sections, applied across all data using machine learning." placement="bottom" />
						</div>
						<div class="mt-2 mb-3">
							<TagOperatorSwitch 
								operator={currentTagOperator as 'AND' | 'OR'}
								onOperatorChange={handleTagOperatorChange}
								class="block"
							/>
							<span class="text-xs text-black">
								{currentTagOperator === 'AND' ? 'Include only content with all selected topics' : 'Include content with any selected topics'}
							</span>
						</div>
					</div>

					{#if currentTagOperator === 'AND'}
					<!-- use dedicated component for AND op -->
						<TagsANDSelector
							recordTypes={currentRecordTypes || []}
							allRecordTypes={recordTypes}
							availableTags={availableTagNames}
							selectedTags={currentTags || []}
							onTagsSelected={handleTagsChange}
						/>
					{:else}
						<!-- OR op uses simple Toggle group -->
						<ToggleGroup
							items={availableTagNames}
							selectedItems={currentTags || []}
							onItemSelected={handleTagsChange}
							requireOneItemSelected={false}>
							{#snippet children(item, isSelected, isDisabled)}
								<Tag variant={isSelected ? 'selected' : 'default'} disabled={isDisabled} interactive={true}>
									{item}
								</Tag>
							{/snippet}
						</ToggleGroup>
					{/if}
				{:else}
					<!-- Dummy tags section for preview -->
					<DummyTagsSection />
				{/if}
			</div>
		</NavContainer>

	<!-- Show filters status when nav is collapsed -->
	{#if !navExpanded}
		<FiltersStatusPanel
			selectedRecordTypes={currentRecordTypes}
			allRecordTypes={recordTypes}
			selectedTags={currentTags}
			tagOperator={currentTagOperator as 'AND' | 'OR'}
			class="absolute top-3 left-3"
		/>
	{/if}

		{#if showCellModal && selectedCellId}
			<div
				class="z-30 absolute top-0 right-0 w-1/2 h-full bg-atm-sand overflow-y-auto border-l border-solid border-atm-sand-border shadow-[-5px_0px_20px_5px_rgba(0,0,0,0.07)]"
			>
				<FeaturesPanel
					cellId={selectedCellId}
					period={currentPeriod}
					bounds={selectedCellBounds ?? undefined}
					recordTypes={currentRecordTypes}
					tags={currentTags}
					tagOperator={currentTagOperator as 'AND' | 'OR'}
					onClose={handleFeaturesPanelClose}
				/>
			</div>
		{/if}
	</div>

	{#if mergedHistogram}
		<TimePeriodSelector
			period={currentPeriod}
			histogram={mergedHistogram}
			onPeriodChange={handlePeriodChange}
			class="z-40 bg-atm-sand border-t border-atm-sand-border"
		/>
	{/if}

	<FeatureDetailModal />
</div>
