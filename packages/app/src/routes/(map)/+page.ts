// Reads the URL's filters and place against metadata and shapes the initial UI state.
// Metadata itself comes from the layout load (fetched once, reused across filter
// navigations); the heavy heatmap/histogram are fetched client-side by the page component
// so the shell renders immediately — see +layout.ts and +page.svelte.
//
// What is wrong with the link travels to the page as data, since a loader cannot show a
// toast: the values the index does not have (ignored), and a place lookup that failed.
// The period is checked by the page against the loaded heatmap, the one list of slices.

import type { PageLoad } from './$types';
import type { PlaceSearchMatch } from '@atm/shared/types';
import type { UiSortMode } from '#lib/components/FeaturesSortSelect.svelte';
import { parsePlaceSelection, parsePlacePanelFlag, parseSortSelection } from '#lib/utils/page-params.js';
import { parseFilterState } from '#lib/utils/filters.js';
import { apiUrl } from '#lib/utils/api.js';
import { describeFailure, type Failure } from '#lib/utils/fetchJson.js';

export const load: PageLoad = async ({ url, parent, fetch }) => {
	const { metadata } = await parent();

	const cellParam = url.searchParams.get('cell');
	const periodParam = url.searchParams.get('period');

	// One filter state, validated against metadata; unknown values drop out and are listed.
	// The page serialises it for every fetch, so nothing is parsed twice.
	const parsed = parseFilterState(url, metadata);
	const filters = parsed.filters;
	const unknownValues = [...parsed.unknownValues];

	// Selected place (the search filter): hydrate the id into a full match — this is also
	// how a shared URL restores its selection. A place the index does not have is an
	// unknown value; a lookup that failed is not, the place may well exist.
	const placeSelection = parsePlaceSelection(url);
	let selectedPlace: PlaceSearchMatch | null = null;
	let placeRestoreFailure: Failure | null = null;
	if (placeSelection.placeId) {
		try {
			const params = new URLSearchParams({ id: placeSelection.placeId });
			if (placeSelection.nameId) {
				params.set('nameId', placeSelection.nameId);
			}
			const res = await fetch(apiUrl('/api/places', params));
			if (!res.ok) {
				throw res;
			}
			const placeData = await res.json();
			selectedPlace = placeData.matches[0] || null;
			if (!selectedPlace) {
				unknownValues.push(placeSelection.placeId);
			} else if (placeSelection.nameId && selectedPlace.matchedNameId !== placeSelection.nameId) {
				// the place exists, the name in the link does not: shown under its current name
				unknownValues.push(placeSelection.nameId);
			}
		} catch (err) {
			console.warn('Place lookup failed:', err);
			placeRestoreFailure = describeFailure(err);
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
		periodParam,
		currentSort,
		currentSampleSeed,
		selectedPlace,
		placePanelOpen,
		unknownValues,
		placeRestoreFailure
	};
};
