// (map)/+page.ts - Load metadata, histogram, and heatmap timeline from the API.
//
// metadata, heatmap and histogram are fetched together in one Promise.all — the
// data fetches used to wait behind metadata so they could be handed cleaned filter
// params, but the endpoints treat an unknown filter value as matching nothing
// (identical to dropping it), so they can take the raw URL params directly and run
// in parallel. The metadata-based validation still runs afterwards, but only to
// drive the filter UI and surface warnings — it no longer gates the data.
import type { PageLoad } from './$types';
import type {
	VisualizationMetadata,
	Histogram,
	HeatmapTimeline,
	HeatmapDimensions,
	HeatmapResponse,
	RecordType,
	PlaceType
} from '@atm/shared/types';
import type { AppError } from '$types/error';
import { createPageErrorData, createError, createValidationError, createPeriodNotFoundError } from '$utils/error';
import { validateCellId } from '$utils/utils';
import { getCellBoundsFromCellId } from '$utils/heatmap';
import { translateAll } from '$utils/translations';
import { loadingState } from '$lib/state/loadingState.svelte';

// Helper functions for period validation
function isValidPeriodFormat(period: string): boolean {
	return /^\d{4}_\d{4}$/.test(period);
}

function isChronologicallyValid(period: string): boolean {
	const [start, end] = period.split('_').map(Number);
	return start < end;
}

function getLastAvailablePeriod(heatmapTimeline: HeatmapTimeline | null): string {
	if (!heatmapTimeline) return '';
	const periods = Object.keys(heatmapTimeline);
	return periods.length > 0 ? periods[periods.length - 1] : '';
}

export const load: PageLoad = async ({ fetch, url }) => {
	loadingState.startLoading();

	const errors: AppError[] = [];

	// Parse URL parameters
	const recordTypesParam = url.searchParams.get('recordTypes');
	const datasetsParam = url.searchParams.get('datasets');
	const placeTypesParam = url.searchParams.get('placeTypes');
	const tagsParam = url.searchParams.get('tags');
	const tagOperatorParam = url.searchParams.get('tagOperator');
	const cellParam = url.searchParams.get('cell');
	const periodParam = url.searchParams.get('period');

	// Forward the filter params to the data endpoints exactly as they arrived. An
	// unknown value simply matches no rows server-side, so no metadata-based cleaning
	// is needed before fetching. Heatmap and histogram filter identically, so one
	// query string serves both.
	const filterParams = new URLSearchParams();
	if (recordTypesParam) filterParams.set('recordTypes', recordTypesParam);
	if (datasetsParam) filterParams.set('datasets', datasetsParam);
	if (placeTypesParam) filterParams.set('placeTypes', placeTypesParam);
	const filterQuery = filterParams.toString();
	const withFilters = (path: string) => (filterQuery ? `${path}?${filterQuery}` : path);

	// Read a SvelteKit error-response body for its message, falling back to status text.
	const errorMessageFrom = async (response: Response): Promise<string> => {
		try {
			const body = await response.json();
			if (body?.message) return body.message;
		} catch {
			// fall through
		}
		return response.statusText || `HTTP ${response.status}`;
	};

	// Metadata promise — fetched alongside the data, no longer a barrier. Each promise
	// returns its value (or null) rather than mutating outer state, so the results are
	// properly typed after the await and error handling stays local.
	const metadataPromise = (async (): Promise<VisualizationMetadata | null> => {
		try {
			const response = await fetch('/api/metadata');
			if (!response.ok) {
				errors.push(
					createError('error', 'API Request Failed', `Failed to fetch metadata: HTTP ${response.status}`, {
						status: response.status,
						statusText: response.statusText
					})
				);
				return null;
			}
			return (await response.json()) as VisualizationMetadata;
		} catch (err) {
			console.error('❌ Failed to load metadata:', err);
			errors.push(
				createError(
					'error',
					'Metadata Load Failed',
					'Could not load visualization metadata. Please ensure the server is running and the binary file is available.',
					{ error: err instanceof Error ? err.message : 'Unknown error', timestamp: new Date().toISOString() }
				)
			);
			return null;
		}
	})();

	// Histogram promise
	const histogramPromise = (async (): Promise<Histogram | null> => {
		try {
			const response = await fetch(withFilters('/api/histogram'));
			if (!response.ok) {
				errors.push(
					createError('warning', 'Histogram Load Failed', await errorMessageFrom(response), {
						recordTypes: recordTypesParam,
						status: response.status
					})
				);
				return null;
			}
			return (await response.json()) as Histogram;
		} catch (err) {
			console.error('❌ Failed to load histogram:', err);
			errors.push(
				createError(
					'warning',
					'Histogram Load Error',
					'Could not load histogram data. The map will still function but temporal data may be limited.',
					{ recordTypes: recordTypesParam, error: err instanceof Error ? err.message : 'Unknown error' }
				)
			);
			return null;
		}
	})();

	// Heatmap timeline promise
	const heatmapPromise = (async (): Promise<HeatmapResponse | null> => {
		try {
			const response = await fetch(withFilters('/api/heatmaps'));
			if (!response.ok) {
				errors.push(
					createError('warning', 'Heatmap Load Failed', await errorMessageFrom(response), {
						recordTypes: recordTypesParam,
						status: response.status
					})
				);
				return null;
			}
			return (await response.json()) as HeatmapResponse;
		} catch (err) {
			console.error('❌ Failed to load heatmap timeline:', err);
			errors.push(
				createError(
					'warning',
					'Heatmap Load Error',
					'Could not load heatmap timeline. Spatial visualization may be limited.',
					{ recordTypes: recordTypesParam, error: err instanceof Error ? err.message : 'Unknown error' }
				)
			);
			return null;
		}
	})();

	// One barrier: metadata and the data resolve together.
	const [metadata, histogram, heatmapData] = await Promise.all([
		metadataPromise,
		histogramPromise,
		heatmapPromise
	]);
	const heatmapTimeline: HeatmapTimeline | null = heatmapData?.timeline ?? null;
	const heatmapDimensions: HeatmapDimensions | null = heatmapData?.dimensions ?? null;

	// ────────────────────────────────────────────────────────────────────────────
	// Validation for the UI only — filter chips, warnings and deep-link handling.
	// This no longer gates the fetches above; it annotates what was already loaded.
	// ────────────────────────────────────────────────────────────────────────────

	// Determine recordTypes to use for UI state
	let currentRecordTypes: RecordType[] = [];

	if (metadata?.recordTypes) {
		// Handle recordTypes parameter
		if (recordTypesParam) {
			const requestedTypes = recordTypesParam.split(',').map((t) => t.trim()) as RecordType[];
			const validTypes = requestedTypes.filter((type) => metadata.recordTypes.includes(type));
			const invalidTypes = requestedTypes.filter((type) => !metadata.recordTypes.includes(type));

			if (validTypes.length > 0) {
				// Some valid types found - show warnings for invalid ones only
				for (const invalidType of invalidTypes) {
					errors.push(
						createError(
							'warning',
							'Invalid Content Type Removed',
							`"${invalidType}" is not a valid content type and was removed from your selection.`,
							{ invalidType, availableTypes: translateAll(metadata.recordTypes) }
						)
					);
				}
				currentRecordTypes = validTypes;
			} else {
				// No valid types found - warn and reflect all types in the UI. The data
				// fetch already ran with the raw param, so an all-invalid selection shows
				// an empty map alongside this warning.
				errors.push(
					createValidationError(
						'recordTypes',
						recordTypesParam,
						`No valid content types found. Showing all content types: ${translateAll(metadata.recordTypes).join(', ')}`
					)
				);
				currentRecordTypes = metadata.recordTypes;
			}
		} else {
			// No recordTypes parameter - initialize with all available record types
			currentRecordTypes = metadata.recordTypes;
		}
	}

	// Determine sources to use
	let currentDatasets: string[] = [];
	if (metadata?.datasets) {
		const availableDatasetIds = metadata.datasets.map(s => s.id);
		if (datasetsParam) {
			const requestedDatasets = datasetsParam.split(',').map(s => s.trim());
			currentDatasets = requestedDatasets.filter(s => availableDatasetIds.includes(s));
			if (currentDatasets.length === 0) {
				currentDatasets = availableDatasetIds;
			}
		} else {
			currentDatasets = availableDatasetIds;
		}
	}

	// Determine place types to use
	let currentPlaceTypes: PlaceType[] = [];
	if (metadata?.placeTypes) {
		if (placeTypesParam) {
			const requestedPlaceTypes = placeTypesParam.split(',').map(t => t.trim()) as PlaceType[];
			currentPlaceTypes = requestedPlaceTypes.filter(t => metadata.placeTypes.includes(t));
			if (currentPlaceTypes.length === 0) {
				currentPlaceTypes = metadata.placeTypes;
			}
		} else {
			currentPlaceTypes = metadata.placeTypes;
		}
	}

	// Parse tags if provided. Existence is validated against metadata here; the tags
	// feature is not yet exposed in the UI, so no tag data is fetched (the
	// available-tags / tag-combinations endpoints stay for when it is).
	let currentTags: string[] | undefined;

	// Parse tagOperator with default to OR (advanced search is AND)
	const currentTagOperator = tagOperatorParam === 'AND' ? 'AND' : 'OR';

	if (metadata?.tags && tagsParam) {
		const requestedTags = tagsParam.split(',').map((t) => t.trim()) as string[];

		const existingTags = requestedTags.filter((tag) => metadata.tags.includes(tag));
		const nonExistentTags = requestedTags.filter((tag) => !metadata.tags.includes(tag));

		for (const invalidTag of nonExistentTags) {
			errors.push(
				createError(
					'warning',
					'Invalid Tag Removed',
					`"${invalidTag}" is not a valid tag and was removed from your search.`,
					{ invalidTag, availableTags: metadata.tags }
				)
			);
		}

		currentTags = existingTags;
	}

	// Validate cell parameter if provided
	let validatedCell: string | null = null;
	let cellBounds: { minLat: number; maxLat: number; minLon: number; maxLon: number } | null = null;

	if (cellParam && heatmapDimensions) {
		const validation = validateCellId(cellParam, heatmapDimensions);

		if (validation.isValid) {
			validatedCell = cellParam;
			// Calculate cell bounds on-demand from dimensions
			const bounds = getCellBoundsFromCellId(cellParam, heatmapDimensions);
			if (bounds) {
				cellBounds = bounds;
			}
		} else {
			errors.push(
				createValidationError(
					'cell',
					cellParam,
					validation.error || `Cell "${cellParam}" not found. Please select a valid cell from the map.`
				)
			);
		}
	}

	// Validate period parameter if provided
	let validatedPeriod: string | null = null;

	if (periodParam && metadata) {
		// Get available periods from metadata (all periods that exist in dataset)
		const metadataPeriods = metadata.timeSlices.map(slice => slice.key);
		const timelineData = heatmapTimeline ? heatmapTimeline : {};

		// 1. Format validation
		if (!isValidPeriodFormat(periodParam)) {
			errors.push(
				createValidationError(
					'period',
					periodParam,
					'invalid format. Expected YYYY_YYYY (e.g., 1950_2000). Defaulting to most recent period'
				)
			);
		}
		// 2. Chronological validation
		else if (!isChronologicallyValid(periodParam)) {
			errors.push(
				createValidationError(
					'period',
					periodParam,
					'invalid range. Start year must be less than end year. Defaulting to most recent period'
				)
			);
		}
		// 3. Availability — must be one of the actual time slices. This also bounds the
		// duration: a slice is one bin wide, so an over-wide period simply isn't a slice
		// and is rejected here (the old hard-coded 50-year cap didn't track binSize).
		else if (!metadataPeriods.includes(periodParam)) {
			const fallbackPeriod = getLastAvailablePeriod(timelineData) || metadataPeriods[metadataPeriods.length - 1] || '';
			errors.push(
				createPeriodNotFoundError(periodParam, metadataPeriods, fallbackPeriod)
			);
		}
		// 4. Valid period (exists in metadata, even if no data)
		else {
			validatedPeriod = periodParam;
		}
	}

	// Default to last available period if validation fails or no period provided
	const defaultPeriod = validatedPeriod || getLastAvailablePeriod(heatmapTimeline ? heatmapTimeline : null);

	loadingState.stopLoading();
	return {
		metadata,
		histogram,
		heatmapTimeline,
		heatmapDimensions,
		currentRecordTypes,
		currentPlaceTypes,
		currentDatasets,
		currentTags,
		currentTagOperator,
		validatedCell,
		cellBounds,
		validatedPeriod: defaultPeriod,
		errorData: createPageErrorData(errors)
	};
};
