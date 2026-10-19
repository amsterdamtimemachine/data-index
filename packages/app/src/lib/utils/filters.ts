/**
 * The filter state's three edges: read it from a URL (validated against metadata),
 * write it to request params, and tell whether a selection is everything. Pure and
 * universal, so the loader, the page and the panels share one definition.
 */
import type { VisualizationMetadata } from '@atm/shared/types';
import type { FilterState } from '$types/filters';
import { parseSearchQuery, parseTagSelection } from './page-params';

function parseList(url: URL, name: string): string[] | null {
	const raw = url.searchParams.get(name);
	if (!raw) {
		return null;
	}
	return raw.split(',').map((s) => s.trim()).filter((s) => s.length > 0);
}

/** Does the selection cover every option? An empty selection means "no filter", so it counts as all. */
export function selectsAll(selected: string[], all: string[]): boolean {
	if (selected.length === 0) {
		return true;
	}
	return selected.length === all.length && all.every((item) => selected.includes(item));
}

/**
 * The filter state a URL asks for, checked against what the index has. Values the
 * index does not have are left out of the state and listed in unknownValues, as the
 * link wrote them; a category with nothing valid left falls back to everything.
 * Without metadata (its load failed) the categories stay empty.
 */
export function parseFilterState(url: URL, metadata: VisualizationMetadata | null): { filters: FilterState; unknownValues: string[] } {
	const unknownValues: string[] = [];
	const tagSelection = parseTagSelection(url);
	const filters: FilterState = {
		recordTypes: [],
		datasets: [],
		placeTypes: [],
		tags: [],
		tagOperator: tagSelection.tagOperator,
		searchQuery: parseSearchQuery(url)
	};
	if (!metadata) {
		return { filters, unknownValues };
	}

	// the known values of one category, the unknown ones noted
	function known(requested: string[] | null, all: string[]): string[] {
		if (!requested) {
			return [];
		}
		const valid: string[] = [];
		for (const value of requested) {
			if (all.includes(value)) {
				valid.push(value);
			} else {
				unknownValues.push(value);
			}
		}
		return valid;
	}

	const validTypes = known(parseList(url, 'recordTypes'), metadata.recordTypes);
	filters.recordTypes = metadata.recordTypes;
	if (validTypes.length > 0) {
		filters.recordTypes = validTypes as FilterState['recordTypes'];
	}

	const datasetIds = metadata.datasets.map((d) => d.id);
	const validDatasets = known(parseList(url, 'datasets'), datasetIds);
	filters.datasets = datasetIds;
	if (validDatasets.length > 0) {
		filters.datasets = validDatasets;
	}

	const validPlaceTypes = known(parseList(url, 'placeTypes'), metadata.placeTypes);
	filters.placeTypes = metadata.placeTypes;
	if (validPlaceTypes.length > 0) {
		filters.placeTypes = validPlaceTypes as FilterState['placeTypes'];
	}

	filters.tags = known(tagSelection.tags, metadata.tags);

	return { filters, unknownValues };
}

/**
 * The state as request params, the way every data endpoint reads them. A category
 * that selects everything is left out (absent means all, and the URL stays short);
 * without metadata every non-empty list is sent. Tags travel with their operator.
 */
export function filterParams(filters: FilterState, metadata?: VisualizationMetadata | null): URLSearchParams {
	const params = new URLSearchParams();
	let allRecordTypes: string[] = [];
	let allDatasets: string[] = [];
	let allPlaceTypes: string[] = [];
	if (metadata) {
		allRecordTypes = metadata.recordTypes;
		allDatasets = metadata.datasets.map((d) => d.id);
		allPlaceTypes = metadata.placeTypes;
	}
	if (filters.recordTypes.length > 0 && !(metadata && selectsAll(filters.recordTypes, allRecordTypes))) {
		params.set('recordTypes', filters.recordTypes.join(','));
	}
	if (filters.datasets.length > 0 && !(metadata && selectsAll(filters.datasets, allDatasets))) {
		params.set('datasets', filters.datasets.join(','));
	}
	if (filters.placeTypes.length > 0 && !(metadata && selectsAll(filters.placeTypes, allPlaceTypes))) {
		params.set('placeTypes', filters.placeTypes.join(','));
	}
	if (filters.searchQuery) {
		params.set('q', filters.searchQuery);
	}
	if (filters.tags.length > 0) {
		params.set('tags', filters.tags.join(','));
		params.set('tagOperator', filters.tagOperator);
	}
	return params;
}
