// Validates the URL's filter/period params against metadata and shapes the initial UI
// state. Metadata itself comes from the layout load (fetched once, reused across filter
// navigations); the heavy heatmap/histogram are fetched client-side by the page component
// so the shell renders immediately — see +layout.ts and +page.svelte.

import type { PageLoad } from './$types';
import type { PlaceSearchMatch } from '@atm/shared/types';
import type { AppError } from '$types/error';
import { createPageErrorData, createError, createValidationError, createPeriodNotFoundError } from '$utils/error';
import type { UiSortMode } from '$components/FeaturesSortSelect.svelte';
import { parsePlaceSelection, parsePlacePanelFlag, parseSortSelection } from '$utils/page-params';
import { parseFilterState } from '$utils/filters';
import { apiUrl } from '$utils/api';

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

	const cellParam = url.searchParams.get('cell');
	const periodParam = url.searchParams.get('period');

	// One filter state, validated against metadata; unknown values warn and drop out.
	// The page serialises it for every fetch, so nothing is parsed twice.
	const parsed = parseFilterState(url, metadata);
	const filters = parsed.filters;
	errors.push(...parsed.errors);

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
	// also how a shared URL restores its selection. Unknown id → warning toast; failed
	// fetch → error toast. Either way the selection is dropped.
	const placeSelection = parsePlaceSelection(url);
	let selectedPlace: PlaceSearchMatch | null = null;
	if (placeSelection.placeId) {
		let restoreFailed = false;
		try {
			const params = new URLSearchParams({ id: placeSelection.placeId });
			if (placeSelection.nameId) {
				params.set('nameId', placeSelection.nameId);
			}
			const res = await fetch(apiUrl('/api/places', params));
			if (res.ok) {
				const placeData = await res.json();
				selectedPlace = placeData.matches[0] || null;
			} else {
				restoreFailed = true;
			}
		} catch (err) {
			console.error('Failed to load selected place:', err);
			restoreFailed = true;
		}
		if (restoreFailed) {
			errors.push(
				createError('error', 'Place Filter Load Failed', 'Could not restore the place filter. Please try again later.', {
					placeId: placeSelection.placeId
				})
			);
		} else if (!selectedPlace) {
			errors.push(
				createError('warning', 'Place Not Found', 'The place in this URL does not exist anymore. The place filter was removed.', {
					placeId: placeSelection.placeId
				})
			);
		}
	}

	// Place panel open flag; only meaningful with a resolved place.
	let placePanelOpen = false;
	if (parsePlacePanelFlag(url) && selectedPlace) {
		placePanelOpen = true;
	}

	const sortSelection = parseSortSelection(url);
	const currentSort: UiSortMode = sortSelection.sort;
	const currentSampleSeed = sortSelection.sampleSeed;

	return {
		filters,
		cellParam,
		currentSort,
		currentSampleSeed,
		selectedPlace,
		placePanelOpen,
		validatedPeriod,
		errorData: createPageErrorData(errors)
	};
};
