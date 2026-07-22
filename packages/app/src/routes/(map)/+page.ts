// Only metadata is fetched here. The heavy heatmap/histogram are fetched client-side by the page
// component instead, so the shell renders immediately and they fill in — see
// +page.svelte. 

import type { PageLoad } from './$types';
import type { VisualizationMetadata, RecordType, PlaceType } from '@atm/shared/types';
import type { AppError } from '$types/error';
import { createPageErrorData, createError, createValidationError, createPeriodNotFoundError } from '$utils/error';
import { translateAll } from '$utils/translations';

// Helper functions for period validation
function isValidPeriodFormat(period: string): boolean {
	return /^\d{4}_\d{4}$/.test(period);
}

function isChronologicallyValid(period: string): boolean {
	const [start, end] = period.split('_').map(Number);
	return start < end;
}

export const load: PageLoad = async ({ fetch, url }) => {
	const errors: AppError[] = [];

	// Parse URL parameters
	const recordTypesParam = url.searchParams.get('recordTypes');
	const datasetsParam = url.searchParams.get('datasets');
	const placeTypesParam = url.searchParams.get('placeTypes');
	const tagsParam = url.searchParams.get('tags');
	const tagOperatorParam = url.searchParams.get('tagOperator');
	const cellParam = url.searchParams.get('cell');
	const periodParam = url.searchParams.get('period');

	const filterParams = new URLSearchParams();
	if (recordTypesParam) filterParams.set('recordTypes', recordTypesParam);
	if (datasetsParam) filterParams.set('datasets', datasetsParam);
	if (placeTypesParam) filterParams.set('placeTypes', placeTypesParam);
	const filterQuery = filterParams.toString();

	// Fetch metadata 
	let metadata: VisualizationMetadata | null = null;
	try {
		const response = await fetch('/api/metadata');
		if (!response.ok) {
			errors.push(
				createError('error', 'API Request Failed', `Failed to fetch metadata: HTTP ${response.status}`, {
					status: response.status,
					statusText: response.statusText
				})
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
				{ error: err instanceof Error ? err.message : 'Unknown error', timestamp: new Date().toISOString() }
			)
		);
	}

	// Determine recordTypes to use for UI state
	let currentRecordTypes: RecordType[] = [];
	if (metadata?.recordTypes) {
		if (recordTypesParam) {
			const requestedTypes = recordTypesParam.split(',').map((t) => t.trim()) as RecordType[];
			const validTypes = requestedTypes.filter((type) => metadata.recordTypes.includes(type));
			const invalidTypes = requestedTypes.filter((type) => !metadata.recordTypes.includes(type));

			if (validTypes.length > 0) {
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
				// All requested types invalid: warn, and reflect all types in the UI. The
				// component's fetch already ran with the raw param, so the map shows empty.
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
			currentRecordTypes = metadata.recordTypes;
		}
	}

	// Determine sources to use
	let currentDatasets: string[] = [];
	if (metadata?.datasets) {
		const availableDatasetIds = metadata.datasets.map((s) => s.id);
		if (datasetsParam) {
			const requestedDatasets = datasetsParam.split(',').map((s) => s.trim());
			currentDatasets = requestedDatasets.filter((s) => availableDatasetIds.includes(s));
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
			const requestedPlaceTypes = placeTypesParam.split(',').map((t) => t.trim()) as PlaceType[];
			currentPlaceTypes = requestedPlaceTypes.filter((t) => metadata.placeTypes.includes(t));
			if (currentPlaceTypes.length === 0) {
				currentPlaceTypes = metadata.placeTypes;
			}
		} else {
			currentPlaceTypes = metadata.placeTypes;
		}
	}

	// Parse tags if provided. Existence is validated against metadata here; the tags
	// feature is not yet exposed in the UI, so no tag data is fetched.
	let currentTags: string[] | undefined;
	const currentTagOperator = tagOperatorParam === 'AND' ? 'AND' : 'OR';

	if (metadata?.tags && tagsParam) {
		const requestedTags = tagsParam.split(',').map((t) => t.trim()) as string[];
		const existingTags = requestedTags.filter((tag) => metadata.tags.includes(tag));
		const nonExistentTags = requestedTags.filter((tag) => !metadata.tags.includes(tag));

		for (const invalidTag of nonExistentTags) {
			errors.push(
				createError('warning', 'Invalid Tag Removed', `"${invalidTag}" is not a valid tag and was removed from your search.`, {
					invalidTag,
					availableTags: metadata.tags
				})
			);
		}
		currentTags = existingTags;
	}

	// Validate the period param against metadata (format, chronology, availability). The
	// default when it's absent or invalid needs the heatmap timeline, so it's computed in
	// the component once that arrives; here we only pass through a valid period, or null.
	let validatedPeriod: string | null = null;
	if (periodParam && metadata) {
		const metadataPeriods = metadata.timeSlices.map((slice) => slice.key);

		if (!isValidPeriodFormat(periodParam)) {
			errors.push(
				createValidationError('period', periodParam, 'invalid format. Expected YYYY_YYYY (e.g., 1950_2000). Defaulting to most recent period')
			);
		} else if (!isChronologicallyValid(periodParam)) {
			errors.push(
				createValidationError('period', periodParam, 'invalid range. Start year must be less than end year. Defaulting to most recent period')
			);
		}
		// Availability also bounds duration: a period is one bin wide, so an over-wide one
		// simply isn't a slice and is rejected here.
		else if (!metadataPeriods.includes(periodParam)) {
			const fallbackPeriod = metadataPeriods[metadataPeriods.length - 1] || '';
			errors.push(createPeriodNotFoundError(periodParam, metadataPeriods, fallbackPeriod));
		} else {
			validatedPeriod = periodParam;
		}
	}

	return {
		metadata,
		filterQuery,
		cellParam,
		currentRecordTypes,
		currentPlaceTypes,
		currentDatasets,
		currentTags,
		currentTagOperator,
		validatedPeriod,
		errorData: createPageErrorData(errors)
	};
};
