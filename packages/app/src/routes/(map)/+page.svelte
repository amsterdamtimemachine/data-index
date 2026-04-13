<!-- (map)/+page.svelte -->
<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { onNavigate, afterNavigate } from '$app/navigation';
	import { goto } from '$app/navigation';
	import { createStateController } from '$state/StateController.svelte';
	import { createPageErrorData } from '$utils/error';
	import { translateContentTypes, reverseTranslateContentTypes } from '$utils/translations';
	import { loadingState } from '$lib/state/loadingState.svelte';
	import QuestionMark from 'phosphor-svelte/lib/QuestionMark';
	import Heading from '$components/Heading.svelte';
	import Heatmap from '$components/Heatmap.svelte';
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
import type { Histogram, HeatmapTimeline } from '@atm/shared/types';
import { env } from '$env/dynamic/public';
import { createEmptyHeatmap, getCellBoundsFromCellId } from '$utils/heatmap';

	let { data }: { data: PageData } = $props();

	// Derived data from server
	let dimensions = $derived(data?.heatmapDimensions);
	let recordTypes = $derived(data?.metadata?.recordTypes || []);
	let tags = $derived(data?.metadata?.tags);
	let availableTagNames = $derived(
		data?.availableTags?.tags?.map((tag: { name: string }) => tag.name) || data?.metadata?.tags || []
	);
	let heatmapTimeline = $derived(data?.heatmapTimeline as HeatmapTimeline | null);

	let currentRecordTypes = $derived(data?.currentRecordTypes || []);
	let datasetIds = $derived(data?.metadata?.datasets?.map((s: { id: string }) => s.id) || []);
	let currentDatasets = $derived(data?.currentDatasets || []);
	let currentTags = $derived(data?.currentTags || []);
	let currentTagOperator = $derived(data?.currentTagOperator || 'OR');
	let validatedCell = $derived(data?.validatedCell);
	let validatedCellBounds = $derived(data?.cellBounds);
	let validatedPeriod = $derived(data?.validatedPeriod);
	let histogram = $derived(data?.histogram as Histogram | null);

	// Translated content types for UI display
	let translatedRecordTypes = $derived(recordTypes ? translateContentTypes(recordTypes) : []);
	let translatedCurrentRecordTypes = $derived(currentRecordTypes ? translateContentTypes(currentRecordTypes) : []);

	// Source labels from metadata (used as toggle display + reverse lookup)
	let datasetLookup = $derived(new Map(data?.metadata?.datasets?.map((s: { id: string; label: string }) => [s.id, s.label]) || []));
	let datasetLabels = $derived(datasetIds.map((id: string) => datasetLookup.get(id) || id));
	let currentDatasetLabels = $derived(currentDatasets.map((id: string) => datasetLookup.get(id) || id));

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

	// Heatmap for current time period - directly from API (DB handles merging)
	let currentHeatmap = $derived(
		heatmapTimeline?.[currentPeriod] ?? (dimensions ? createEmptyHeatmap() : null)
	);


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
					if (env.PUBLIC_DEFAULT_CELL && dimensions) {
						// Calculate bounds on-demand from dimensions
						const bounds = getCellBoundsFromCellId(env.PUBLIC_DEFAULT_CELL, dimensions);
						if (bounds) {
							controller.selectCell(env.PUBLIC_DEFAULT_CELL, bounds);
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

	function handleDatasetChange(datasets: string[] | string) {
		const labelArray = Array.isArray(datasets) ? datasets : [datasets];
		// Reverse lookup: label → id
		const reverseMap = new Map(Array.from(datasetLookup.entries()).map(([id, label]) => [label, id]));
		const ids = labelArray.map(label => reverseMap.get(label) || label);

		const url = new URL(window.location.href);
		if (ids.length > 0) {
			url.searchParams.set('datasets', ids.join(','));
		} else {
			url.searchParams.delete('datasets');
		}
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
		if (cellId && dimensions) {
			// Calculate bounds on-demand from dimensions
			const bounds = getCellBoundsFromCellId(cellId, dimensions);
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
		{#if currentHeatmap && dimensions}
			<Heatmap
				heatmap={currentHeatmap}
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

				<div class="mb-4">
					<div class="flex mb-2">
						<Heading level={3} class="pr-2"> Dataset </Heading>
						<Tooltip icon={QuestionMark} text="Filter op basis van de dataset waaruit de data afkomstig is." placement="bottom" />
					</div>
					<ToggleGroup
						items={datasetLabels}
						selectedItems={currentDatasetLabels}
						onItemSelected={handleDatasetChange}
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
					datasets={currentDatasets}
					tags={currentTags}
					tagOperator={currentTagOperator as 'AND' | 'OR'}
					onClose={handleFeaturesPanelClose}
				/>
			</div>
		{/if}
	</div>

	{#if histogram}
		<TimePeriodSelector
			period={currentPeriod}
			histogram={histogram}
			onPeriodChange={handlePeriodChange}
			class="z-40 bg-atm-sand border-t border-atm-sand-border"
		/>
	{/if}

	<FeatureDetailModal />
</div>
