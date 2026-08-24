<!-- (map)/+page.svelte -->
<script lang="ts">
	import { tick, untrack } from 'svelte';
	import { afterNavigate } from '$app/navigation';
	import { createMapSelection } from '$state/map-selection.svelte';
	import { createPageErrorData, createError, createValidationError } from '$utils/error';
	import { validateCellId } from '$utils/utils';
	import { loadingState } from '$lib/state/loadingState.svelte';
	import { fetchJson } from '$utils/fetchJson';
	import { createMediaQuery, MOBILE_QUERY, MOBILE_MAX_WIDTH } from '$utils/media.svelte';
	import FeaturesPanelResizeHandle, {
		panelWidthCss,
		type PanelCols
	} from '$components/FeaturesPanelResizeHandle.svelte';
	import { type UiSortMode } from '$components/FeaturesSortSelect.svelte';
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
	import type { PanelSubject } from '$lib/state/panel-features.svelte';
	import type { AppError } from '$types/error';
	import { env } from '$env/dynamic/public';
	import { createEmptyHeatmap, getCellBoundsFromCellId, getCellIdFromLonLat } from '$utils/heatmap';


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

	const isMobile = createMediaQuery(MOBILE_QUERY);

	// Page-owned so the chosen size survives the panel's open/close cycles.
	let panelCols = $state<PanelCols>(3);

	// Cell-view sorting; the URL seeds the initial value, this state owns it after.
	let sortMode = $state<UiSortMode>(untrack(() => data?.currentSort) ?? 'sample');
	let sampleSeed = $state<string | undefined>(untrack(() => data?.currentSampleSeed));

	// The URL carries only what affects the current view: the seed param exists
	// only while the sample sort is active (the in-memory seed survives, so
	// returning to sample restores the same shuffle and re-writes the param).
	function handleSortChange(mode: UiSortMode) {
		sortMode = mode;
		if (mode === 'sample') {
			mapSelection.updateUrlParam('sort', null);
			if (sampleSeed) {
				mapSelection.updateUrlParam('sampleSeed', sampleSeed);
			}
		} else {
			mapSelection.updateUrlParam('sort', mode);
			mapSelection.updateUrlParam('sampleSeed', null);
		}
	}

	function handleShuffle() {
		const seed = Math.random().toString(36).slice(2, 10);
		sampleSeed = seed;
		mapSelection.updateUrlParam('sampleSeed', seed);
	}

	const panelWidth = $derived.by(() => {
		if (isMobile.matches) {
			return undefined;
		}
		return panelWidthCss(panelCols);
	});

	const gridColumns = $derived.by(() => {
		if (isMobile.matches) {
			return undefined;
		}
		return panelCols;
	});

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

	const mapSelection = createMapSelection();
	let currentPeriod = $derived(mapSelection.currentPeriod);
	let selectedCellId = $derived(mapSelection.selectedCellId);
	let selectedCellBounds = $derived(mapSelection.selectedCellBounds);
	let showCellModal = $derived(mapSelection.showCellModal);

	// Navigation state
	let navExpanded = $state(true);

	let allErrors = $derived.by(() => {
		const serverErrors = data.errorData?.errors || [];
		const controllerErrors = mapSelection.errors || [];
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

		// Period: the URL param if it names a loaded slice, else the most recent one.
		// Slice keys derive from the bin configuration, so bookmarked URLs can go stale.
		let initialPeriod = getLastAvailablePeriod(heatmapTimeline);
		if (validatedPeriod) {
			if (heatmapTimeline[validatedPeriod]) {
				initialPeriod = validatedPeriod;
			} else {
				clientErrors = [
					...clientErrors,
					createValidationError(
						'period',
						validatedPeriod,
						`Period "${validatedPeriod}" not found. Showing the most recent period instead.`
					)
				];
			}
		}
		mapSelection.initialize(initialPeriod);

		tick().then(() => {
			// Validate the deep-linked cell against the now-available dimensions (this used
			// to be done in the loader, but dimensions arrive client-side now).
			if (data.cellParam && dimensions) {
				const validation = validateCellId(data.cellParam, dimensions);
				if (validation.isValid) {
					const bounds = getCellBoundsFromCellId(data.cellParam, dimensions);
					if (bounds) mapSelection.selectCell(data.cellParam, bounds);
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
					mapSelection.syncUrlParameters(lastPeriod, currentTagOperator, defaultRecordTypes);

					// Skip the default cell on mobile — the map opens unfiltered there.
					if (window.innerWidth > MOBILE_MAX_WIDTH && env.PUBLIC_DEFAULT_CENTER && dimensions) {
						const [lon, lat] = env.PUBLIC_DEFAULT_CENTER.split(',').map(Number);
						if (Number.isFinite(lon) && Number.isFinite(lat)) {
							const cellId = getCellIdFromLonLat(lon, lat, dimensions);
							const bounds = getCellBoundsFromCellId(cellId, dimensions);
							if (bounds) mapSelection.selectCell(cellId, bounds);
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

	// Nulled up front: a cell switch must never show the previous cell's bars.
	$effect(() => {
		const cellBounds = selectedCellBounds;
		const filterQs = data.filterQuery;

		cellHistogram = null;
		if (!cellBounds) {
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

	// The open place panel's series: features in the place's cells per bin.
	let placeHistogram = $state<Histogram | null>(null);
	$effect(() => {
		const open = placePanelOpen;
		const place = data.selectedPlace;
		const filterQs = data.filterQuery;

		placeHistogram = null;
		if (!open || !place) {
			return;
		}
		let qs = '';
		if (filterQs) {
			qs = `${filterQs}&`;
		}
		return fetchJson<Histogram>(
			`/api/histogram?${qs}placeId=${encodeURIComponent(place.placeId)}`,
			(res) => {
				placeHistogram = res;
			},
			() => {
				// silent by design: the timeline degrades to the city-wide histogram
			}
		);
	});

	// The panel subject's series, overlaid on the timeline in red; on mobile it
	// only accompanies the open panel.
	const localHistogram = $derived.by(() => {
		if (placePanelOpen) {
			if (!placeHistogram || placeHistogram.bins.length === 0) {
				return null;
			}
			return placeHistogram;
		}
		if (!cellHistogram || cellHistogram.bins.length === 0) {
			return null;
		}
		if (isMobile.matches && !showCellModal) {
			return null;
		}
		return cellHistogram;
	});

	// A filter change reloads the page data (new errorData); drop the previous load's
	// client-side errors so they don't accumulate across navigations.
	afterNavigate(() => {
		clientErrors = [];
	});

	function handlePeriodChange(period: string) {
		mapSelection.updatePeriod(period);
		mapSelection.updateUrlParam('period', period);
	}

	// Handle cell selection from map; selecting a cell takes over the panel from
	// the place view, but never clears the place filter itself.
	function handleCellClick(cellId: string | null) {
		if (cellId) {
			handleClosePlacePanel();
		}
		if (cellId && dimensions) {
			// Calculate bounds on-demand from dimensions
			const bounds = getCellBoundsFromCellId(cellId, dimensions);
			if (bounds) {
				mapSelection.selectCell(cellId, bounds);
			} else {
				mapSelection.selectCell(cellId);
			}
		} else {
			mapSelection.selectCell(null);
		}
	}

	function handleFeaturesPanelClose() {
		if (placePanelOpen) {
			handleClosePlacePanel();
			return;
		}
		mapSelection.clearErrors();
		mapSelection.selectCell(null);
	}

	// Place panel: the features panel showing a searched place's cell set. Open
	// state is client-owned and mirrored to the URL like the cell selection.
	let placePanelOpen = $state(untrack(() => data.placePanelOpen ?? false));

	function handleOpenPlacePanel() {
		mapSelection.selectCell(null);
		placePanelOpen = true;
		mapSelection.updateUrlParam('placePanel', '1');
	}

	function handleClosePlacePanel() {
		placePanelOpen = false;
		mapSelection.updateUrlParam('placePanel', null);
	}

	// clearing the place filter also closes its panel
	$effect(() => {
		if (!data.selectedPlace && placePanelOpen) {
			placePanelOpen = false;
		}
	});

	const panelSubject = $derived.by(() => {
		if (placePanelOpen && data.selectedPlace) {
			return { kind: 'place', place: data.selectedPlace } as PanelSubject;
		}
		if (selectedCellId) {
			return {
				kind: 'cell',
				cellId: selectedCellId,
				bounds: selectedCellBounds ?? undefined
			} as PanelSubject;
		}
		return null;
	});
	const showPanel = $derived.by(() => {
		if (!panelSubject) {
			return false;
		}
		if (panelSubject.kind === 'place') {
			return true;
		}
		return showCellModal;
	});

	// The period active when the panel's subject was picked — the mobile minimap
	// shows the map as it was at that moment, so it must not track later drags.
	let panelSelectionPeriod = $state('');
	$effect(() => {
		const subject = panelSubject;
		if (!subject) {
			return;
		}
		untrack(() => {
			panelSelectionPeriod = mapSelection.currentPeriod;
		});
	});
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
				placeCells={data.selectedPlace?.cells}
				placeSelected={placePanelOpen}
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
				selectedPlace={data.selectedPlace}
				onOpenPlacePanel={handleOpenPlacePanel}
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
			class="absolute top-3 left-3 max-w-[calc(100%-1.5rem)]"
		/>
	{/if}

		{#if showPanel && panelSubject}
			<div
				class="z-30 absolute top-0 right-0 w-full h-full bg-atm-sand overflow-hidden border-l border-solid border-atm-sand-border shadow-[-5px_0px_20px_5px_rgba(0,0,0,0.07)]"
				style:width={panelWidth}
			>
				<FeaturesPanelResizeHandle cols={panelCols} onSizeChange={(cols) => (panelCols = cols)} />
				<div class="h-full overflow-y-auto">
					<FeaturesPanel
						subject={panelSubject}
						placeCells={data.selectedPlace?.cells}
						period={currentPeriod}
						timeline={heatmapTimeline ?? undefined}
						dimensions={dimensions ?? undefined}
						selectionPeriod={panelSelectionPeriod}
						recordTypes={currentRecordTypes}
						placeTypes={currentPlaceTypes}
						datasets={currentDatasets}
						tags={currentTags}
						tagOperator={currentTagOperator as 'AND' | 'OR'}
						{gridColumns}
						{sortMode}
						{sampleSeed}
						onSortChange={handleSortChange}
						onShuffle={handleShuffle}
						onClose={handleFeaturesPanelClose}
					/>
				</div>
			</div>
		{/if}
	</div>

	{#if histogram}
		<TimePeriodSelector
			period={currentPeriod}
			{histogram}
			{localHistogram}
			onPeriodChange={handlePeriodChange}
			class="z-40 bg-atm-sand border-t border-atm-sand-border"
		/>
	{/if}

	<FeatureDetailModal />
</div>
