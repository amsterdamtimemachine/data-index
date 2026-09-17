/**
 * The filter state's three edges: read it from a URL (validated against metadata),
 * write it to request params, and tell whether a selection is everything. Pure and
 * universal, so the loader, the page and the panels share one definition.
 */
import type { VisualizationMetadata } from '@atm/shared/types';
import type { FilterState } from '$types/filters';
import type { AppError } from '$types/error';
import { createError, createValidationError } from './error';
import { translateAll } from './translations';
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
 * The filter state a URL asks for, checked against what the index has. Unknown record
 * types and tags are dropped with a warning; unknown datasets and place types are
 * dropped silently. A category with nothing valid left falls back to everything.
 * Without metadata (its load failed) the categories stay empty.
 */
export function parseFilterState(url: URL, metadata: VisualizationMetadata | null): { filters: FilterState; errors: AppError[] } {
	const errors: AppError[] = [];
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
		return { filters, errors };
	}

	const requestedTypes = parseList(url, 'recordTypes');
	if (requestedTypes) {
		const validTypes = requestedTypes.filter((type) => (metadata.recordTypes as string[]).includes(type));
		const invalidTypes = requestedTypes.filter((type) => !(metadata.recordTypes as string[]).includes(type));
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
			filters.recordTypes = validTypes as FilterState['recordTypes'];
		} else {
			errors.push(
				createValidationError(
					'recordTypes',
					requestedTypes.join(','),
					`No valid content types found. Showing all content types: ${translateAll(metadata.recordTypes).join(', ')}`
				)
			);
			filters.recordTypes = metadata.recordTypes;
		}
	} else {
		filters.recordTypes = metadata.recordTypes;
	}

	const datasetIds = metadata.datasets.map((d) => d.id);
	const requestedDatasets = parseList(url, 'datasets');
	filters.datasets = datasetIds;
	if (requestedDatasets) {
		const validDatasets = requestedDatasets.filter((id) => datasetIds.includes(id));
		if (validDatasets.length > 0) {
			filters.datasets = validDatasets;
		}
	}

	const requestedPlaceTypes = parseList(url, 'placeTypes');
	filters.placeTypes = metadata.placeTypes;
	if (requestedPlaceTypes) {
		const validPlaceTypes = requestedPlaceTypes.filter((type) => (metadata.placeTypes as string[]).includes(type));
		if (validPlaceTypes.length > 0) {
			filters.placeTypes = validPlaceTypes as FilterState['placeTypes'];
		}
	}

	for (const tag of tagSelection.tags) {
		if (metadata.tags.includes(tag)) {
			filters.tags.push(tag);
		} else {
			errors.push(
				createError('warning', 'Invalid Tag Removed', `"${tag}" is not a valid tag and was removed from your selection.`, {
					invalidTag: tag,
					availableTags: metadata.tags
				})
			);
		}
	}

	return { filters, errors };
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
