
import { browser } from '$app/environment';
import { page } from '$app/state';
import { replaceState } from '$app/navigation';
import type { AppError } from '$types/error';

/**
 * The map view's selection — period and selected cell — mirrored into the URL
 * (replaceState, no navigation). The component is responsible for navigation decisions.
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
	let errors = $state<AppError[]>([]);

	// Callback for cell selection
	let onCellSelected = $state<
		| ((
				cellId: string | null,
				bounds?: { minLat: number; maxLat: number; minLon: number; maxLon: number }
		  ) => void)
		| null
	>(null);

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
		serverTagOperator: string = 'OR',
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

		// Set tagOperator to URL if not already present
		const urlTagOperator = page.url.searchParams.get('tagOperator');
		if (!urlTagOperator) {
			paramsToAdd.tagOperator = serverTagOperator;
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
	 * Selects a cell and updates URL. Calls onCellSelected callback.
	 * Pass null to deselect the current cell.
	 */
	function selectCell(
		cellId: string | null,
		bounds?: { minLat: number; maxLat: number; minLon: number; maxLon: number }
	) {
		selectedCellId = cellId;
		selectedCellBounds = bounds || null;

		if (cellId) {
			updateUrlParams({ cell: cellId });
		} else {
			updateUrlParams({ cell: null });
		}

		// Call callback if provided
		if (onCellSelected) {
			onCellSelected(cellId, bounds);
		}
	}

	/**
	 * Clears all current errors. Useful when navigating or retrying operations.
	 */
	function clearErrors() {
		errors = [];
	}

	/**
	 * Updates URL parameters without triggering navigation.
	 * Maintains current page state while updating the address bar.
	 * Guards against calling before router is initialized.
	 */
	function updateUrlParams(params: Record<string, string | null>) {
		if (!browser) return;

		try {
			const url = new URL(window.location.href);

			Object.entries(params).forEach(([key, value]) => {
				if (value) {
					url.searchParams.set(key, value);
				} else {
					url.searchParams.delete(key);
				}
			});

			replaceState(url.pathname + url.search, page.state);
		} catch (error) {
			// Router not initialized yet, skip URL update
			console.debug('Router not ready, skipping URL update:', error);
		}
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
		get errors() {
			return errors;
		},

		// State management methods
		initialize,
		updatePeriod,
		selectCell,
		clearErrors,

		// URL utilities
		updateUrlParam,
		updateUrlParams,
		syncUrlParameters,

		// Callback setters
		set onCellSelected(
			callback:
				| ((
						cellId: string | null,
						bounds?: { minLat: number; maxLat: number; minLon: number; maxLon: number }
				  ) => void)
				| null
		) {
			onCellSelected = callback;
		}
	};
}
