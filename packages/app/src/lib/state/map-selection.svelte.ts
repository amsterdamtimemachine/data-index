
import { browser } from '$app/env';
import { page } from '$app/state';
import { goto } from '$app/navigation';
import type { HeatmapDimensions, PlaceSearchMatch } from '@atm/shared/types';
import { getCellBoundsFromCellId } from '#lib/utils/heatmap.js';

/**
 * The map view's selection — period and selected cell — mirrored into the URL
 * (a shallow replace, no navigation), and what the user is pointing at. One instance
 * for the app: the page initialises it, the map draws from it, the search writes
 * the hover to it.
 */
export function createMapSelection() {
	let currentPeriod = $state<string>('');
	let selectedCellId = $state<string | null>(null);
	let selectedCellBounds = $state<{
		minLat: number;
		maxLat: number;
		minLon: number;
		maxLon: number;
	} | null>(null);

	// the grid, so a cell id resolves to its bounds
	let dimensions = $state<HeatmapDimensions | null>(null);
	// the cells of the search result under the pointer or the arrow keys
	let hoveredCells = $state<number[] | null>(null);

	function setDimensions(grid: HeatmapDimensions | null) {
		dimensions = grid;
	}

	function hoverPlace(match: PlaceSearchMatch | null) {
		if (match) {
			hoveredCells = match.cells;
		} else {
			hoveredCells = null;
		}
	}

	/**
	 * Initializes the controller with server data.
	 */
	function initialize(serverPeriod: string) {
		currentPeriod = serverPeriod;
	}

	/**
	 * Updates the current time period.
	 */
	function updatePeriod(newPeriod: string) {
		currentPeriod = newPeriod;
	}

	/**
	 * Updates a single URL parameter without navigation.
	 */
	function updateUrlParam(key: string, value: string | null) {
		updateUrlParams({ [key]: value });
	}

	/**
	 * Syncs URL parameters with current state after navigation is complete.
	 */
	function syncUrlParameters(
		serverPeriod: string,
		serverRecordTypes: string[] = []
	) {
		if (!browser) return;

		// Collect all missing parameters in a single object
		const paramsToAdd: Record<string, string | null> = {};

		// Set period to URL if not already present
		const urlPeriod = page.url.searchParams.get('period');
		if (!urlPeriod) {
			paramsToAdd.period = serverPeriod;
		}

		// Set recordTypes to URL if not already present
		const urlRecordTypes = page.url.searchParams.get('recordTypes');
		if (!urlRecordTypes && serverRecordTypes.length > 0) {
			paramsToAdd.recordTypes = serverRecordTypes.join(',');
		}

		// Update all missing parameters at once
		if (Object.keys(paramsToAdd).length > 0) {
			updateUrlParams(paramsToAdd);
		}

		// Check if cell should be opened from URL parameters
		const cellParam = page.url.searchParams.get('cell');
		if (cellParam) {
			selectCell(cellParam);
		}
	}

	/**
	 * Selects a cell and updates the URL; its bounds follow from the grid.
	 * Pass null to deselect the current cell.
	 */
	function selectCell(cellId: string | null) {
		selectedCellId = cellId;
		selectedCellBounds = null;
		if (cellId && dimensions) {
			selectedCellBounds = getCellBoundsFromCellId(cellId, dimensions);
		}

		if (cellId) {
			updateUrlParams({ cell: cellId });
		} else {
			updateUrlParams({ cell: null });
		}
	}


	/**
	 * Updates URL parameters without triggering navigation.
	 * Maintains current page state while updating the address bar.
	 * Guards against calling before router is initialized.
	 */
	function updateUrlParams(params: Record<string, string | null>) {
		if (!browser) return;

		const url = new URL(window.location.href);

		Object.entries(params).forEach(([key, value]) => {
			if (value) {
				url.searchParams.set(key, value);
			} else {
				url.searchParams.delete(key);
			}
		});

		goto(url.pathname + url.search, { shallow: true, replace: true, state: page.state }).catch((error) => {
			// Router not initialized yet, skip URL update
			console.debug('Router not ready, skipping URL update:', error);
		});
	}

	return {
		// State getters (reactive)
		get currentPeriod() {
			return currentPeriod;
		},
		get selectedCellId() {
			return selectedCellId;
		},
		get selectedCellBounds() {
			return selectedCellBounds;
		},
		get showCellModal() {
			return !!selectedCellId;
		},

		get hoveredCells() {
			return hoveredCells;
		},

		// State management methods
		initialize,
		setDimensions,
		updatePeriod,
		selectCell,
		hoverPlace,

		// URL utilities
		updateUrlParam,
		updateUrlParams,
		syncUrlParameters
	};
}

export const mapSelection = createMapSelection();
