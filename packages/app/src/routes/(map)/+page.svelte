<!-- (map)/+page.svelte -->
<script lang="ts">
	import { tick } from 'svelte';
	import { onNavigate, afterNavigate } from '$app/navigation';
	import { goto } from '$app/navigation';
	import { createStateController } from '$state/StateController.svelte';
	import { createPageErrorData, createError, createValidationError } from '$utils/error';
	import { validateCellId } from '$utils/utils';
	import { translateAll, reverseTranslateAll } from '$utils/translations';
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
import type { Histogram, HeatmapTimeline, HeatmapDimensions, HeatmapResponse } from '@atm/shared/types';
import type { AppError } from '$types/error';
import { env } from '$env/dynamic/public';
import { createEmptyHeatmap, getCellBoundsFromCellId } from '$utils/heatmap';

	let { data }: { data: PageData } = $props();

	// Heatmap and histogram are fetched client-side (see the effects below) rather than
	// in the loader, so the page shell renders without waiting on them. They start null
	// and populate when the fetch resolves; the template already guards on them.
	let heatmapTimeline = $state<HeatmapTimeline | null>(null);
	let dimensions = $state<HeatmapDimensions | null>(null);
	let histogram = $state<Histogram | null>(null);
	// Errors from the client-side fetches and the deep-link validation that depends on
	// them — the loader's errorData can't carry these since they happen after it returns.
	let clientErrors = $state<AppError[]>([]);

	// Derived data from server (metadata is loaded and validated in +page.ts)
	let recordTypes = $derived(data?.metadata?.recordTypes || []);
	let tags = $derived(data?.metadata?.tags);
	// Tags feature is not yet exposed; no tag data is fetched, so this falls back to
	// the tag vocabulary metadata already carries.
	let availableTagNames = $derived(data?.metadata?.tags || []);

	let currentRecordTypes = $derived(data?.currentRecordTypes || []);
	let placeTypes = $derived(data?.metadata?.placeTypes || []);
	let currentPlaceTypes = $derived(data?.currentPlaceTypes || []);
	let datasetIds = $derived(data?.metadata?.datasets?.map((s: { id: string }) => s.id) || []);
	let currentDatasets = $derived(data?.currentDatasets || []);
	let currentTags = $derived(data?.currentTags || []);
	let currentTagOperator = $derived(data?.currentTagOperator || 'OR');
	let validatedPeriod = $derived(data?.validatedPeriod);

	// Translated content types for UI display
	let translatedRecordTypes = $derived(recordTypes ? translateAll(recordTypes) : []);
	let translatedCurrentRecordTypes = $derived(currentRecordTypes ? translateAll(currentRecordTypes) : []);

	// Translated place types for UI display (selection + URL stay on raw enum values)
	let translatedPlaceTypes = $derived(placeTypes ? translateAll(placeTypes) : []);
	let translatedCurrentPlaceTypes = $derived(currentPlaceTypes ? translateAll(currentPlaceTypes) : []);

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
	

	// Combine server errors (metadata + param validation), client fetch/validation errors,
	// and controller errors for ErrorHandler
	let allErrors = $derived.by(() => {
		const serverErrors = data.errorData?.errors || [];
		const controllerErrors = controller.errors || [];
		return createPageErrorData([...serverErrors, ...clientErrors, ...controllerErrors]);
	});

	// Heatmap for current time period - directly from API (DB handles merging)
	let currentHeatmap = $derived(
		heatmapTimeline?.[currentPeriod] ?? (dimensions ? createEmptyHeatmap() : null)
	);


	function getLastAvailablePeriod(timeline: HeatmapTimeline | null): string {
		if (!timeline) return '';
		const periods = Object.keys(timeline);
		return periods.length > 0 ? periods[periods.length - 1] : '';
	}

	// One-time setup, run when the heatmap first arrives (not onMount — the data is now
	// fetched client-side and isn't ready at mount). The guard keeps it to the first load;
	// later filter-change fetches just refresh the data through the reactive state above.
	let hasInitialized = false;
	function initializeFromHeatmap() {
		if (hasInitialized || !dimensions || !heatmapTimeline) return;
		hasInitialized = true;

		// Period: the server-validated URL param, else the most recent loaded slice.
		controller.initialize(validatedPeriod || getLastAvailablePeriod(heatmapTimeline));

		tick().then(() => {
			// Validate the deep-linked cell against the now-available dimensions (this used
			// to be done in the loader, but dimensions arrive client-side now).
			if (data.cellParam && dimensions) {
				const validation = validateCellId(data.cellParam, dimensions);
				if (validation.isValid) {
					const bounds = getCellBoundsFromCellId(data.cellParam, dimensions);
					if (bounds) controller.selectCell(data.cellParam, bounds);
				} else {
					clientErrors = [
						...clientErrors,
						createValidationError('cell', data.cellParam, validation.error || `Cell "${data.cellParam}" not found. Please select a valid cell from the map.`)
					];
				}
			}

			// Set URL defaults if no parameters exist
			const hasUrlParams = window.location.search.length > 0;
			if (!hasUrlParams && heatmapTimeline && recordTypes.length > 0) {
				const lastPeriod = getLastAvailablePeriod(heatmapTimeline);
				const defaultRecordTypes = currentRecordTypes.length > 0 ? currentRecordTypes : recordTypes;

				if (lastPeriod && defaultRecordTypes.length > 0) {
					controller.syncUrlParameters(lastPeriod, currentTagOperator, defaultRecordTypes);

					if (env.PUBLIC_DEFAULT_CELL && dimensions) {
						const bounds = getCellBoundsFromCellId(env.PUBLIC_DEFAULT_CELL, dimensions);
						if (bounds) controller.selectCell(env.PUBLIC_DEFAULT_CELL, bounds);
					}
				}
			}
		});
	}

	// Fetch heatmap + histogram on the client, re-fetching when the filters change. They
	// go through the raw filter query the loader forwarded (an all-invalid filter yields
	// an empty map, matching the loader's warning). Each fetch cancels a superseded one so
	// a slow earlier response can't overwrite a newer filter's data.
	$effect(() => {
		const qs = data.filterQuery ? `?${data.filterQuery}` : '';
		let cancelled = false;
		loadingState.startLoading();

		fetch(`/api/heatmaps${qs}`)
			.then((r) => (r.ok ? (r.json() as Promise<HeatmapResponse>) : Promise.reject(r)))
			.then((res) => {
				if (cancelled) return;
				heatmapTimeline = res.timeline;
				dimensions = res.dimensions;
				initializeFromHeatmap();
			})
			.catch(() => {
				if (cancelled) return;
				clientErrors = [
					...clientErrors,
					createError('warning', 'Heatmap Load Error', 'Could not load heatmap. Spatial visualization may be limited.', {
						recordTypes: currentRecordTypes
					})
				];
			})
			.finally(() => loadingState.stopLoading());

		return () => {
			cancelled = true;
		};
	});

	$effect(() => {
		const qs = data.filterQuery ? `?${data.filterQuery}` : '';
		let cancelled = false;

		fetch(`/api/histogram${qs}`)
			.then((r) => (r.ok ? (r.json() as Promise<Histogram>) : Promise.reject(r)))
			.then((res) => {
				if (!cancelled) histogram = res;
			})
			.catch(() => {
				if (cancelled) return;
				clientErrors = [
					...clientErrors,
					createError('warning', 'Histogram Load Error', 'Could not load histogram. Temporal data may be limited.', {
						recordTypes: currentRecordTypes
					})
				];
			});

		return () => {
			cancelled = true;
		};
	});

	// A filter change reloads the page data (new errorData); drop the previous load's
	// client-side errors so they don't accumulate across navigations.
	afterNavigate(() => {
		clientErrors = [];
	});


	function handlePeriodChange(period: string) {
		controller.updatePeriod(period);
		controller.updateUrlParam('period', period);
	}

	function handleRecordTypeChange(recordTypes: string[] | string) {
		// Translate Dutch labels back to English for API/URL  
		const dutchArray = Array.isArray(recordTypes) ? recordTypes : [recordTypes];
		const englishArray = reverseTranslateAll(dutchArray);
		
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

	function handlePlaceTypeChange(selected: string[] | string) {
		// Translate Dutch labels back to the raw place-type enum for the URL param
		const dutchArray = Array.isArray(selected) ? selected : [selected];
		const selectedArray = reverseTranslateAll(dutchArray);
		const url = new URL(window.location.href);
		if (selectedArray.length > 0) {
			url.searchParams.set('placeTypes', selectedArray.join(','));
		} else {
			url.searchParams.delete('placeTypes');
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
			{#snippet header()}
				<Nav class="p-3">
					<NavItem href="/about" label="Over" />
				</Nav>
			{/snippet}
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

				{#if placeTypes.length > 1}
				<div class="mb-4">
					<div class="flex mb-2">
						<Heading level={3} class="pr-2"> Geometrie </Heading>
						<Tooltip icon={QuestionMark} text="Filter op basis van het type locatie waarmee de data is verbonden." placement="bottom" />
					</div>
					<ToggleGroup
						items={translatedPlaceTypes}
						selectedItems={translatedCurrentPlaceTypes}
						onItemSelected={handlePlaceTypeChange}
						requireOneItemSelected={true}>
						{#snippet children(item, isSelected, isDisabled)}
							<Tag variant={isSelected ? 'selected-outline' : 'outline'} disabled={isDisabled} interactive={true}>
								{item}
							</Tag>
						{/snippet}
					</ToggleGroup>
				</div>
				{/if}

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
			selectedPlaceTypes={currentPlaceTypes}
			allPlaceTypes={placeTypes}
			selectedDatasets={currentDatasetLabels}
			allDatasets={datasetLabels}
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
					placeTypes={currentPlaceTypes}
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
