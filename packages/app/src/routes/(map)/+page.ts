// (map)/+page.ts - Load metadata, histogram, and heatmap timeline from new API with error accumulation
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
import { translateContentType, translateContentTypes } from '$utils/translations';
import { loadingState } from '$lib/state/loadingState.svelte';

// Helper functions for period validation
function isValidPeriodFormat(period: string): boolean {
	return /^\d{4}_\d{4}$/.test(period);
}

function getPeriodDuration(period: string): number {
	const [start, end] = period.split('_').map(Number);
	return end - start;
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
	let metadata: VisualizationMetadata | null = null;
	let histogram: Histogram | null = null;
	let heatmapTimeline: HeatmapTimeline | null = null;
	let heatmapDimensions: HeatmapDimensions | null = null;
	let availableTags: any = null;

	// Parse URL parameters
	const recordTypesParam = url.searchParams.get('recordTypes');
	const datasetsParam = url.searchParams.get('datasets');
	const placeTypesParam = url.searchParams.get('placeTypes');
	const tagsParam = url.searchParams.get('tags');
	const tagOperatorParam = url.searchParams.get('tagOperator');
	const cellParam = url.searchParams.get('cell');
	const periodParam = url.searchParams.get('period');

	try {
		const response = await fetch('/api/metadata');

		if (!response.ok) {
			errors.push(
				createError(
					'error',
					'API Request Failed',
					`Failed to fetch metadata: HTTP ${response.status}`,
					{ status: response.status, statusText: response.statusText }
				)
			);
		} else {
			metadata = (await response.json()) as VisualizationMetadata;
		}
	} catch (err) {
		console.error('❌ Failed to load metadata:', err);

		errors.push(
			createError(
				'error',
				'Metadata Load Failed',
				'Could not load visualization metadata. Please ensure the server is running and the binary file is available.',
				{
					error: err instanceof Error ? err.message : 'Unknown error',
					timestamp: new Date().toISOString()
				}
			)
		);
	}

	// Determine recordTypes to use for API requests and UI state
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
							{ invalidType, availableTypes: translateContentTypes(metadata.recordTypes) }
						)
					);
				}
				currentRecordTypes = validTypes;
			} else {
				// No valid types found - show single comprehensive error message
				errors.push(
					createValidationError(
						'recordTypes',
						recordTypesParam,
						`No valid content types found. Defaulting to all content types: ${translateContentTypes(metadata.recordTypes).join(', ')}`
					)
				);
				// Default to all record types for better UX
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

	// Parse tags if provided - need to validate combinations, not just existence
	let currentTags: string[] | undefined;

	// Parse tagOperator with default to OR (advanced search is AND)
	const currentTagOperator = tagOperatorParam === 'AND' ? 'AND' : 'OR';

	if (metadata?.tags && tagsParam) {
		const requestedTags = tagsParam.split(',').map((t) => t.trim()) as string[];

		// First filter: tags that exist in metadata
		const existingTags = requestedTags.filter((tag) => metadata.tags.includes(tag));
		const nonExistentTags = requestedTags.filter((tag) => !metadata.tags.includes(tag));

		// Add errors for non-existent tags
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

		// Second filter: validate tag combinations with current record types
		// We'll validate this after we have currentRecordTypes determined
		currentTags = existingTags; // For now, will validate combinations later
	}

	// Histogram promise
	const histogramPromise = (async () => {
		try {
			let histogramUrl = '/api/histogram';
			const histogramParams = new URLSearchParams();
			if (currentRecordTypes.length > 0) {
				histogramParams.set('recordTypes', currentRecordTypes.join(','));
			}
			if (currentDatasets.length > 0) {
				histogramParams.set('datasets', currentDatasets.join(','));
			}
			if (histogramParams.toString()) {
				histogramUrl += '?' + histogramParams.toString();
			}
			const histogramResponse = await fetch(histogramUrl);

			if (!histogramResponse.ok) {
				// Parse error message from SvelteKit error response
				let errorMessage = `HTTP ${histogramResponse.status}`;
				try {
					const errorData = await histogramResponse.json();
					if (errorData.message) {
						errorMessage = errorData.message;
					}
				} catch {
					// Fallback to status text if JSON parsing fails
					errorMessage = histogramResponse.statusText || errorMessage;
				}

				errors.push(
					createError('warning', 'Histogram Load Failed', errorMessage, {
						recordTypes: currentRecordTypes,
						tags: currentTags,
						status: histogramResponse.status
					})
				);
			} else {
				histogram = (await histogramResponse.json()) as Histogram;
			}
		} catch (err) {
			console.error('❌ Failed to load histogram:', err);

			errors.push(
				createError(
					'warning',
					'Histogram Load Error',
					'Could not load histogram data. The map will still function but temporal data may be limited.',
					{
						recordTypes: currentRecordTypes,
						tags: currentTags,
						error: err instanceof Error ? err.message : 'Unknown error'
					}
				)
			);
		}
	})();

	// Heatmap timeline promise
	const heatmapPromise = (async () => {
		try {
			let heatmapUrl = '/api/heatmaps';
			const heatmapParams = new URLSearchParams();
			if (currentRecordTypes.length > 0) {
				heatmapParams.set('recordTypes', currentRecordTypes.join(','));
			}
			if (currentDatasets.length > 0) {
				heatmapParams.set('datasets', currentDatasets.join(','));
			}
			if (heatmapParams.toString()) {
				heatmapUrl += '?' + heatmapParams.toString();
			}
			const heatmapResponse = await fetch(heatmapUrl);

			if (!heatmapResponse.ok) {
				// Parse error message from SvelteKit error response
				let errorMessage = `HTTP ${heatmapResponse.status}`;
				try {
					const errorData = await heatmapResponse.json();
					if (errorData.message) {
						errorMessage = errorData.message;
					}
				} catch {
					// Fallback to status text if JSON parsing fails
					errorMessage = heatmapResponse.statusText || errorMessage;
				}

				errors.push(
					createError('warning', 'Heatmap Load Failed', errorMessage, {
						recordTypes: currentRecordTypes,
						tags: currentTags,
						status: heatmapResponse.status
					})
				);
			} else {
				const heatmapData = (await heatmapResponse.json()) as HeatmapResponse;
				heatmapTimeline = heatmapData.timeline;
				heatmapDimensions = heatmapData.dimensions;
			}
		} catch (err) {
			console.error('❌ Failed to load heatmap timeline:', err);

			errors.push(
				createError(
					'warning',
					'Heatmap Load Error',
					'Could not load heatmap timeline. Spatial visualization may be limited.',
					{
						recordTypes: currentRecordTypes,
						tags: currentTags,
						error: err instanceof Error ? err.message : 'Unknown error'
					}
				)
			);
		}
	})();

	// Available tags promise
	const availableTagsPromise = (async () => {
		try {
			const tagsUrl = `/api/available-tags${currentRecordTypes.length > 0 ? `?recordTypes=${currentRecordTypes.join(',')}` : ''}`;
			const tagsResponse = await fetch(tagsUrl);

			if (!tagsResponse.ok) {
				// Parse error message from SvelteKit error response
				let errorMessage = `HTTP ${tagsResponse.status}`;
				try {
					const errorData = await tagsResponse.json();
					if (errorData.message) {
						errorMessage = errorData.message;
					}
				} catch {
					// Fallback to status text if JSON parsing fails
					errorMessage = tagsResponse.statusText || errorMessage;
				}

				errors.push(
					createError('warning', 'Available Tags Load Failed', errorMessage, {
						recordTypes: currentRecordTypes,
						status: tagsResponse.status
					})
				);
			} else {
				const tagsData = await tagsResponse.json();
				availableTags = tagsData;
			}
		} catch (err) {
			console.error('❌ Failed to load available tags:', err);

			errors.push(
				createError(
					'warning',
					'Available Tags Load Error',
					'Could not load available tags. All tags will be shown in the interface.',
					{
						recordTypes: currentRecordTypes,
						error: err instanceof Error ? err.message : 'Unknown error'
					}
				)
			);
		}
	})();

	// Wait for all data requests to complete
	await Promise.all([histogramPromise, heatmapPromise, availableTagsPromise]);

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
		// 3. Duration validation
		else if (getPeriodDuration(periodParam) > 50) {
			const duration = getPeriodDuration(periodParam);
			errors.push(
				createValidationError(
					'period',
					periodParam,
					`spans ${duration} years. Maximum 50 years supported. Defaulting to most recent period`
				)
			);
		}
		// 4. Availability validation - check if period exists in metadata
		else if (!metadataPeriods.includes(periodParam)) {
			// Use the same fallback logic as the default period assignment
			const fallbackPeriod = getLastAvailablePeriod(timelineData) || metadataPeriods[metadataPeriods.length - 1] || '';
			errors.push(
				createPeriodNotFoundError(periodParam, metadataPeriods, fallbackPeriod)
			);
		}
		// 5. Valid period (exists in metadata, even if no data)
		else {
			validatedPeriod = periodParam;
		}
	}

	// Default to last available period if validation fails or no period provided
	const defaultPeriod = validatedPeriod || getLastAvailablePeriod(heatmapTimeline ? heatmapTimeline : null);

	// Only validate tag combinations for AND operator (OR allows any combination)
	if (
		currentTagOperator === 'AND' &&
		currentTags &&
		currentTags.length > 0 &&
		currentRecordTypes &&
		metadata?.recordTypes
	) {
		try {
			// Use the "show all" exception: if no current record types, use all record types
			const effectiveRecordTypes =
				currentRecordTypes.length > 0 ? currentRecordTypes : metadata.recordTypes;

			// Send all tags to validate in a single API call
			const response = await fetch(
				`/api/tag-combinations?recordTypes=${effectiveRecordTypes.join(',')}&selected=${currentTags.join(',')}&validateAll=true`
			);

			if (response.ok) {
				const data = await response.json();

				// API should return validTags and invalidTags when validateAll=true
				const validCombinations = data.validTags || [];
				const invalidCombinations = data.invalidTags || [];

				// Update currentTags to only valid combinations
				currentTags = validCombinations.length > 0 ? validCombinations : undefined;

				// Add errors for invalid combinations
				for (const invalidTag of invalidCombinations) {
					errors.push(
						createError(
							'warning',
							'Invalid Tag Combination Removed',
							`"${invalidTag}" is not available with the current selection and was removed from your search.`,
							{ invalidTag, recordTypes: effectiveRecordTypes, validTags: validCombinations }
						)
					);
				}
			} else {
				console.error('Failed to validate tag combinations - API error:', response.status);
			}
		} catch (error) {
			console.error('Failed to validate tag combinations in route loader:', error);
			// On error, don't modify currentTags
		}
	}

	loadingState.stopLoading();
	return {
		metadata,
		histogram,
		heatmapTimeline,
		heatmapDimensions,
		availableTags,
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
