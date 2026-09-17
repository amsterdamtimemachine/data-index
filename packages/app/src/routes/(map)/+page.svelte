<!-- (map)/+page.svelte -->
<script lang="ts">
	import { resolve } from '$app/paths';
	import { filterParams } from '$utils/filters';
	import { formatPlaceTitle } from '$utils/format';
	import { tick, untrack } from 'svelte';
	import { afterNavigate } from '$app/navigation';
	import { navigateParams } from '$utils/navigate';
	import { createMapSelection } from '$state/map-selection.svelte';
	import { createTimelineScope } from '$state/timeline-scope.svelte';
	import { createMapData } from '$state/map-data.svelte';
	import { createMapPadding } from '$state/map-padding.svelte';
	import { createSearchPause } from '$state/search-pause.svelte';
	import { createPageErrorData, createValidationError } from '$utils/error';
	import { validateCellId } from '$utils/utils';
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
	import type { HeatmapTimeline } from '@atm/shared/types';
	import type { PanelSubject } from '$lib/state/panel-features.svelte';
	import type { AppError } from '$types/error';
	import { env } from '$env/dynamic/public';
	import { createEmptyHeatmap, getCellBoundsFromCellId, getCellIdFromLonLat } from '$utils/heatmap';


	let { data }: { data: PageData } = $props();

	// validation errors this page raises (a stale period or cell in the URL)
	let pageErrors = $state<AppError[]>([]);

	const isMobile = createMediaQuery(MOBILE_QUERY);

	const filters = $derived(data.filters);
	// a paused search term stays in the chip but leaves every fetch
	const search = createSearchPause(() => filters);
	const searchPaused = $derived(search.paused);
	const activeFilters = $derived(search.activeFilters);
	const activeParams = $derived(filterParams(activeFilters, data.metadata));

	// the collapsed filters line, in one piece
	const filtersStatus = $derived({ filters: activeFilters, metadata: data.metadata, place: data.selectedPlace });

	// The city-wide heatmap and histogram, refetched when the filters change; the
	// first heatmap runs the one-time setup below.
	const mapData = createMapData(
		{
			get params() {
				return activeParams;
			},
			get recordTypes() {
				return filters.recordTypes;
			}
		},
		initializeFromHeatmap
	);
	const heatmapTimeline = $derived(mapData.timeline);
	const dimensions = $derived(mapData.dimensions);
	const histogram = $derived(mapData.histogram);

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
	let validatedPeriod = $derived(data?.validatedPeriod);

	const mapSelection = createMapSelection();
	let currentPeriod = $derived(mapSelection.currentPeriod);
	let selectedCellId = $derived(mapSelection.selectedCellId);
	let selectedCellBounds = $derived(mapSelection.selectedCellBounds);
	let showCellModal = $derived(mapSelection.showCellModal);

	// Navigation state
	let navExpanded = $state(true);

	// the map's camera keeps the strip between the nav and the panel in view
	let navElement = $state<HTMLDivElement>();
	let panelElement = $state<HTMLDivElement>();
	const mapPadding = createMapPadding({
		get navElement() {
			return navElement;
		},
		get panelElement() {
			return panelElement;
		},
		get navExpanded() {
			return navExpanded;
		},
		get panelOpen() {
			return showPanel;
		},
		get isMobile() {
			return isMobile.matches;
		}
	});

	let allErrors = $derived.by(() => {
		const serverErrors = data.errorData?.errors || [];
		const controllerErrors = mapSelection.errors || [];
		return createPageErrorData([...serverErrors, ...pageErrors, ...mapData.errors, ...controllerErrors]);
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
				pageErrors = [
					...pageErrors,
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
			if (data.cellParam && dimensions && !placePanelOpen) {
				const validation = validateCellId(data.cellParam, dimensions);
				if (validation.isValid) {
					const bounds = getCellBoundsFromCellId(data.cellParam, dimensions);
					if (bounds) mapSelection.selectCell(data.cellParam, bounds);
				} else {
					pageErrors = [
						...pageErrors,
						createValidationError('cell', data.cellParam, validation.error || `Cell "${data.cellParam}" not found. Please select a valid cell from the map.`)
					];
				}
			}

			// Set URL defaults if no parameters exist
			const hasUrlParams = window.location.search.length > 0;
			if (!hasUrlParams && heatmapTimeline && recordTypes.length > 0) {
				const lastPeriod = getLastAvailablePeriod(heatmapTimeline);
				let defaultRecordTypes = recordTypes;
				if (filters.recordTypes.length > 0) {
					defaultRecordTypes = filters.recordTypes;
				}

				if (lastPeriod && defaultRecordTypes.length > 0) {
					mapSelection.syncUrlParameters(lastPeriod, defaultRecordTypes);

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

	// The timeline's scope: the whole city, or the panel subject. It fetches the
	// subject's series itself from what the page describes here.
	const timelineScope = createTimelineScope({
		get isMobile() {
			return isMobile.matches;
		},
		get cellModalOpen() {
			return showCellModal;
		},
		get placePanelOpen() {
			return placePanelOpen;
		},
		get placeTitle() {
			if (data.selectedPlace) {
				return formatPlaceTitle(data.selectedPlace);
			}
			return null;
		},
		get cellBounds() {
			return selectedCellBounds;
		},
		get placeId() {
			if (placePanelOpen && data.selectedPlace) {
				return data.selectedPlace.placeId;
			}
			return null;
		},
		get params() {
			return activeParams.toString();
		}
	});

	// A filter change reloads the page data (new errorData); drop the previous load's
	// client-side errors so they don't accumulate across navigations.
	afterNavigate(() => {
		pageErrors = [];
		mapData.clearErrors();
	});

	function handlePeriodChange(period: string) {
		mapSelection.updatePeriod(period);
		mapSelection.updateUrlParam('period', period);
	}

	// Handle cell selection from map; selecting a cell takes over the panel from
	// the place view, but never clears the place filter itself.
	function handleCellClick(cellId: string | null) {
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
		if (cellId && placePanelOpen) {
			setPlacePanel(false);
		}
	}

	function handleFeaturesPanelClose() {
		if (placePanelOpen) {
			setPlacePanel(false);
			return;
		}
		mapSelection.clearErrors();
		mapSelection.selectCell(null);
	}

	// Place panel: the features panel showing a searched place's cell set. The URL
	// flag is its only state, read by the loader; a search pick, the chip and the
	// panel's close all navigate to set or clear it, like any other filter change.
	const placePanelOpen = $derived(data.placePanelOpen ?? false);

	function setPlacePanel(open: boolean) {
		navigateParams((p) => {
			if (open) {
				p.set('placePanel', '1');
			} else {
				p.delete('placePanel');
			}
		});
	}

	function handleTogglePlacePanel() {
		setPlacePanel(!placePanelOpen);
	}

	// an open place panel takes the panel from the cell
	$effect(() => {
		if (placePanelOpen) {
			untrack(() => mapSelection.selectCell(null));
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

	// what the timeline shows, for the empty panel's hint: the selection's series,
	// else the city-wide one where the switch exists to leave it
	const timelineView = $derived.by(() => {
		if (timelineScope.histogram !== null) {
			return 'local' as const;
		}
		if (timelineScope.onToggle !== undefined) {
			return 'cityWide' as const;
		}
		return undefined;
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

<!-- Preloaded from the SSR head: the map data downloads alongside the app bundle
     instead of after hydration. crossorigin matches fetch()'s cors/same-origin mode. -->
<svelte:head>
	<link rel="preload" as="fetch" href={mapData.heatmapUrl} crossorigin="anonymous" />
	<link rel="preload" as="fetch" href={mapData.histogramUrl} crossorigin="anonymous" />
</svelte:head>

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
				padding={mapPadding.padding}
				{handleCellClick}
			/>
		{/if}

		<NavContainer bind:isExpanded={navExpanded} bind:element={navElement} class="absolute top-0 left-0 z-30">
			{#snippet header()}
				<Nav class="p-3">
					<NavItem href={resolve('/about')} label="Over" />
				</Nav>
			{/snippet}
			<FilterPanel
				metadata={data.metadata}
				{filters}
				activeParams={activeParams.toString()}
				selectedPlace={data.selectedPlace}
				onTogglePlacePanel={handleTogglePlacePanel}
				{placePanelOpen}
				{searchPaused}
				onToggleSearch={search.toggle}
			/>
		</NavContainer>

	<!-- Show filters status when nav is collapsed -->
	{#if !navExpanded}
		<FiltersStatusPanel status={filtersStatus} class="absolute top-3 left-3 max-w-[calc(100%-1.5rem)]" />
	{/if}

		{#if showPanel && panelSubject}
			<div
				bind:this={panelElement}
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
						filters={activeFilters}
						{gridColumns}
						{sortMode}
						{sampleSeed}
						onSortChange={handleSortChange}
						onShuffle={handleShuffle}
						onClose={handleFeaturesPanelClose}
						{timelineView}
					/>
				</div>
			</div>
		{/if}
	</div>

	{#if histogram}
		<TimePeriodSelector
			period={currentPeriod}
			{histogram}
			localHistogram={timelineScope.histogram}
			markerHistogram={timelineScope.subjectSeries}
			localLabel={timelineScope.label}
			onToggleLocal={timelineScope.onToggle}
			localToggleOn={timelineScope.switchOn}
			localAvailable={timelineScope.available}
			onPeriodChange={handlePeriodChange}
			class="z-40 bg-atm-sand border-t border-atm-sand-border"
		/>
	{/if}

	<FeatureDetailModal />
</div>
