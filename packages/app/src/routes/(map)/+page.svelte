<!-- (map)/+page.svelte -->
<script lang="ts">
	import { tick } from 'svelte';
	import { afterNavigate } from '$app/navigation';
	import { createStateController } from '$state/StateController.svelte';
	import { createPageErrorData, createError, createValidationError } from '$utils/error';
	import { validateCellId } from '$utils/utils';
	import { loadingState } from '$lib/state/loadingState.svelte';
	import { fetchJson } from '$utils/fetchJson';
	import { createMediaQuery } from '$utils/media.svelte';
	import Heatmap from '$components/Heatmap.svelte';
	import TimePeriodSelector from '$components/TimePeriodSelector.svelte';
	import FilterPanel from '$components/FilterPanel.svelte';
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
	import { createEmptyHeatmap, getCellBoundsFromCellId, getCellIdFromLonLat } from '$utils/heatmap';
	import { MOBILE_MAX_WIDTH } from '$lib/constants';

	let { data }: { data: PageData } = $props();

	// Heatmap and histogram are fetched client-side (see the effects below) rather than
	// in the loader, so the page shell renders without waiting on them. They start null
	// and populate when the fetch resolves; the template already guards on them.
	let heatmapTimeline = $state<HeatmapTimeline | null>(null);
	let dimensions = $state<HeatmapDimensions | null>(null);
	let histogram = $state<Histogram | null>(null);
	// Selected cell's histogram, mobile only — see the gated effect below.
	let cellHistogram = $state<Histogram | null>(null);
	let clientErrors = $state<AppError[]>([]);

	// Matches the panel's fullscreen breakpoint (Tailwind md = 768px).
	const isMobile = createMediaQuery('(max-width: 767px)');

	let recordTypes = $derived(data?.metadata?.recordTypes || []);
	let currentRecordTypes = $derived(data?.currentRecordTypes || []);
	let placeTypes = $derived(data?.metadata?.placeTypes || []);
	let currentPlaceTypes = $derived(data?.currentPlaceTypes || []);
	let currentDatasets = $derived(data?.currentDatasets || []);
	let currentTags = $derived(data?.currentTags || []);
	let currentTagOperator = $derived(data?.currentTagOperator || 'OR');
	let validatedPeriod = $derived(data?.validatedPeriod);

	// dataset id → label, for the status panel (FilterPanel derives its own copy)
	let datasetLookup = $derived(new Map(data?.metadata?.datasets?.map((s: { id: string; label: string }) => [s.id, s.label]) || []));
	let datasetLabels = $derived(data?.metadata?.datasets?.map((s: { label: string }) => s.label) || []);
	let currentDatasetLabels = $derived(currentDatasets.map((id: string) => datasetLookup.get(id) || id));

	const controller = createStateController();
	let currentPeriod = $derived(controller.currentPeriod);
	let selectedCellId = $derived(controller.selectedCellId);
	let selectedCellBounds = $derived(controller.selectedCellBounds);
	let showCellModal = $derived(controller.showCellModal);

	// Navigation state
	let navExpanded = $state(true);

	let allErrors = $derived.by(() => {
		const serverErrors = data.errorData?.errors || [];
		const controllerErrors = controller.errors || [];
		return createPageErrorData([...serverErrors, ...clientErrors, ...controllerErrors]);
	});

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

					// Skip the default cell on mobile — the map opens unfiltered there.
					if (window.innerWidth > MOBILE_MAX_WIDTH && env.PUBLIC_DEFAULT_CENTER && dimensions) {
						const [lon, lat] = env.PUBLIC_DEFAULT_CENTER.split(',').map(Number);
						if (Number.isFinite(lon) && Number.isFinite(lat)) {
							const cellId = getCellIdFromLonLat(lon, lat, dimensions);
							const bounds = getCellBoundsFromCellId(cellId, dimensions);
							if (bounds) controller.selectCell(cellId, bounds);
						}
					}
				}
			}
		});
	}

	// Fetch heatmap + histogram on the client, re-fetching when the filters change.
	$effect(() => {
		const qs = data.filterQuery ? `?${data.filterQuery}` : '';
		loadingState.startLoading();
		return fetchJson<HeatmapResponse>(
			`/api/heatmaps${qs}`,
			(res) => {
				heatmapTimeline = res.timeline;
				dimensions = res.dimensions;
				initializeFromHeatmap();
			},
			() => {
				clientErrors = [
					...clientErrors,
					createError('warning', 'Heatmap Load Error', 'Could not load heatmap. Spatial visualization may be limited.', {
						recordTypes: currentRecordTypes
					})
				];
			},
			() => loadingState.stopLoading()
		);
	});

	$effect(() => {
		const qs = data.filterQuery ? `?${data.filterQuery}` : '';
		return fetchJson<Histogram>(
			`/api/histogram${qs}`,
			(res) => {
				histogram = res;
			},
			() => {
				clientErrors = [
					...clientErrors,
					createError('warning', 'Histogram Load Error', 'Could not load histogram. Temporal data may be limited.', {
						recordTypes: currentRecordTypes
					})
				];
			}
		);
	});

	// Per-cell histogram for the mobile timeline. Fetched only when it can be shown
	// (mobile + a cell selected); nulled at the start of every run so a cell switch
	// never shows the previous cell's bars while the next fetch is in flight. The
	// returned fetchJson cleanup aborts the stale request on re-run. A failed fetch
	// stays null → displayedHistogram falls back to the global bars.
	$effect(() => {
		const mobile = isMobile.matches;
		const cellBounds = selectedCellBounds;
		const filterQs = data.filterQuery;

		cellHistogram = null;
		if (!mobile || !cellBounds) {
			return;
		}

		let qs = '';
		if (filterQs) {
			qs = `${filterQs}&`;
		}
		const boundsQs = `minLon=${cellBounds.minLon}&maxLon=${cellBounds.maxLon}&minLat=${cellBounds.minLat}&maxLat=${cellBounds.maxLat}`;
		return fetchJson<Histogram>(
			`/api/histogram?${qs}${boundsQs}`,
			(res) => {
				cellHistogram = res;
			},
			() => {
				// silent by design: the timeline degrades to the city-wide histogram
			}
		);
	});

	// The timeline's bars: the selected cell's distribution when the fullscreen
	// mobile panel hides the map, the city-wide distribution everywhere else.
	// The thumb reads currentPeriod in every branch — only pixels swap, never state.
	const displayedHistogram = $derived.by(() => {
		// desktop timeline is intentionally global — never swap
		if (!isMobile.matches) {
			return histogram;
		}
		// panel closed → back to the city-wide bars immediately
		if (!showCellModal) {
			return histogram;
		}
		// cell fetch in flight, failed, or degenerate → keep showing global
		// rather than blanking the timeline
		if (!cellHistogram || cellHistogram.bins.length === 0) {
			return histogram;
		}
		// mobile, panel open, cell data arrived
		return cellHistogram;
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

<!-- inline 100dvh tracks the mobile browser chrome; browsers without dvh drop the
     declaration and fall back to the h-screen class -->
<div class="relative flex flex-col w-screen h-screen" style:height="100dvh">
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
			<FilterPanel
				{recordTypes}
				{currentRecordTypes}
				{placeTypes}
				{currentPlaceTypes}
				datasets={data?.metadata?.datasets || []}
				{currentDatasets}
				availableTags={data?.metadata?.tags || []}
				{currentTags}
				currentTagOperator={currentTagOperator as 'AND' | 'OR'}
			/>
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
				class="z-30 absolute top-0 right-0 w-full md:w-1/2 h-full bg-atm-sand overflow-y-auto border-l border-solid border-atm-sand-border shadow-[-5px_0px_20px_5px_rgba(0,0,0,0.07)]"
			>
				<FeaturesPanel
					cellId={selectedCellId}
					period={currentPeriod}
					timeline={heatmapTimeline ?? undefined}
					dimensions={dimensions ?? undefined}
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
			histogram={displayedHistogram ?? histogram}
			onPeriodChange={handlePeriodChange}
			class="z-40 bg-atm-sand border-t border-atm-sand-border"
		/>
	{/if}

	<FeatureDetailModal />
</div>
