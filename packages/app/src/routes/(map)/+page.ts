// Validates the URL's filter/period params against metadata and shapes the initial UI
// state. Metadata itself comes from the layout load (fetched once, reused across filter
// navigations); the heavy heatmap/histogram are fetched client-side by the page component
// so the shell renders immediately — see +layout.ts and +page.svelte.

import type { PageLoad } from './$types';
import type { RecordType, PlaceType, PlaceSearchMatch } from '@atm/shared/types';
import type { AppError } from '$types/error';
import { createPageErrorData, createError, createValidationError, createPeriodNotFoundError } from '$utils/error';
import { translateAll } from '$utils/translations';
import { UI_SORT_MODES, type UiSortMode } from '$components/FeaturesSortSelect.svelte';

// Helper functions for period validation
function isValidPeriodFormat(period: string): boolean {
	return /^\d{4}_\d{4}$/.test(period);
}

function isChronologicallyValid(period: string): boolean {
	const [start, end] = period.split('_').map(Number);
	return start < end;
}

export const load: PageLoad = async ({ url, parent, fetch }) => {
	const { metadata, metadataErrors } = await parent();
	const errors: AppError[] = [...metadataErrors];

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

	// Selected place (the search filter): hydrate the id into a full match — this is
	// also how a shared URL restores its selection. Unknown id → no selection.
	let selectedPlace: PlaceSearchMatch | null = null;
	const placeParam = url.searchParams.get('place');
	if (placeParam) {
		try {
			const res = await fetch(`/api/places?id=${encodeURIComponent(placeParam.slice(0, 512))}`);
			if (res.ok) {
				const placeData = await res.json();
				selectedPlace = placeData.matches[0] || null;
			}
		} catch (err) {
			console.error('Failed to load selected place:', err);
		}
	}

	// Place panel open flag; only meaningful with a resolved place.
	let placePanelOpen = false;
	if (url.searchParams.get('placePanel') === '1' && selectedPlace) {
		placePanelOpen = true;
	}

	// Sort mode + shuffle seed for the cell view; unknown modes fall back to default.
	const sortParam = url.searchParams.get('sort');
	let currentSort: UiSortMode = 'sample';
	if (sortParam && (UI_SORT_MODES as string[]).includes(sortParam)) {
		currentSort = sortParam as UiSortMode;
	}
	let currentSampleSeed: string | undefined = undefined;
	const sampleSeedParam = url.searchParams.get('sampleSeed');
	if (sampleSeedParam) {
		currentSampleSeed = sampleSeedParam.slice(0, 64);
	}

	return {
		filterQuery,
		cellParam,
		currentRecordTypes,
		currentPlaceTypes,
		currentDatasets,
		currentTags,
		currentTagOperator,
		currentSort,
		currentSampleSeed,
		selectedPlace,
		placePanelOpen,
		validatedPeriod,
		errorData: createPageErrorData(errors)
	};
};
