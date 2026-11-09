/**
 * The filter state's three edges: read it from a URL (validated against metadata),
 * write it to request params, and tell whether a selection is everything or nothing.
 * Pure and universal, so the loader, the page and the panels share one definition.
 */
import type { VisualizationMetadata } from '@atm/shared/types';
import type { FilterState } from '#lib/types/filters.js';
import { parseSearchQuery, parseTagSelection } from './page-params';

/** The URL value of a category with nothing selected; absent means everything. */
export const NONE = 'none';

/** The categories a reader can empty, by their param name. */
export const CATEGORIES = ['recordTypes', 'datasets', 'placeTypes'] as const;
export type Category = (typeof CATEGORIES)[number];

function parseList(url: URL, name: string): string[] | null {
	const raw = url.searchParams.get(name);
	if (!raw) {
		return null;
	}
	return raw
		.split(',')
		.map((s) => s.trim())
		.filter((s) => s.length > 0);
}

/** Does the selection cover every option? */
export function selectsAll(selected: string[], all: string[]): boolean {
	return (
		selected.length > 0 &&
		selected.length === all.length &&
		all.every((item) => selected.includes(item))
	);
}

/**
 * The categories with nothing selected, for the page to show instead of data. None
 * without metadata: the categories are empty then because there is nothing to read
 * them against, not because the reader emptied them.
 */
export function emptyCategories(
	filters: FilterState,
	metadata: VisualizationMetadata | null
): Category[] {
	if (!metadata) {
		return [];
	}
	return CATEGORIES.filter((category) => filters[category].length === 0);
}

/**
 * The filter state a URL asks for, checked against what the index has. Values the
 * index does not have are left out of the state and listed in unknownValues, as the
 * link wrote them; a category with nothing valid left falls back to everything, and
 * one written as NONE is empty. Without metadata (its load failed) the categories
 * stay empty.
 */
export function parseFilterState(
	url: URL,
	metadata: VisualizationMetadata | null
): { filters: FilterState; unknownValues: string[] } {
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

	// a category as the URL has it: NONE is empty, nothing valid is everything
	function category(name: Category, all: string[]): string[] {
		const requested = parseList(url, name);
		if (requested?.length === 1 && requested[0] === NONE) {
			return [];
		}
		const valid = known(requested, all);
		if (valid.length > 0) {
			return valid;
		}
		return all;
	}

	filters.recordTypes = category('recordTypes', metadata.recordTypes) as FilterState['recordTypes'];
	filters.datasets = category(
		'datasets',
		metadata.datasets.map((d) => d.id)
	);
	filters.placeTypes = category('placeTypes', metadata.placeTypes) as FilterState['placeTypes'];
	filters.tags = known(tagSelection.tags, metadata.tags);

	return { filters, unknownValues };
}

/**
 * The state as request params, the way every data endpoint reads them. A category
 * that selects everything is left out (absent means all, and the URL stays short);
 * without metadata every non-empty list is sent. Tags travel with their operator.
 */
export function filterParams(
	filters: FilterState,
	metadata?: VisualizationMetadata | null
): URLSearchParams {
	const params = new URLSearchParams();
	let allRecordTypes: string[] = [];
	let allDatasets: string[] = [];
	let allPlaceTypes: string[] = [];
	if (metadata) {
		allRecordTypes = metadata.recordTypes;
		allDatasets = metadata.datasets.map((d) => d.id);
		allPlaceTypes = metadata.placeTypes;
	}
	if (
		filters.recordTypes.length > 0 &&
		!(metadata && selectsAll(filters.recordTypes, allRecordTypes))
	) {
		params.set('recordTypes', filters.recordTypes.join(','));
	}
	if (filters.datasets.length > 0 && !(metadata && selectsAll(filters.datasets, allDatasets))) {
		params.set('datasets', filters.datasets.join(','));
	}
	if (
		filters.placeTypes.length > 0 &&
		!(metadata && selectsAll(filters.placeTypes, allPlaceTypes))
	) {
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
