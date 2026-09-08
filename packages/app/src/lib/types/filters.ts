import type { RecordType, PlaceType, TagOperator } from '@atm/shared/types';

/**
 * The population filters: which features the map, the histogram, the tag counts and
 * the feature list count. One object with one meaning everywhere; the spatial
 * subject (a cell or a place) lives beside it, not inside it.
 */
export interface FilterState {
	recordTypes: RecordType[];
	datasets: string[];
	placeTypes: PlaceType[];
	tags: string[];
	tagOperator: TagOperator;
	searchQuery: string | null;
}
