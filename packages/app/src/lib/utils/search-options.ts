/**
 * The merged search dropdown's options. The text search and the places share one
 * list of string values, so each value carries its kind as a prefix.
 */
import type { PlaceSearchMatch } from '@atm/shared/types';
import type { ComboboxOption } from '$components/Combobox.svelte';
import { formatPlaceTitle } from './format';

const TEXT_PREFIX = 'q:';
const PLACE_PREFIX = 'place:';
// shorter queries fetch nothing and offer no row
export const MIN_QUERY_LENGTH = 2;

export type SearchChoice = { kind: 'text'; query: string } | { kind: 'place'; placeId: string };

export type PlaceOption = { option: ComboboxOption<string>; match: PlaceSearchMatch };

export type SearchOptionSet = {
	// the text search row, once the query is long enough
	text: ComboboxOption<string> | null;
	// the places as served, in chronological order
	places: PlaceOption[];
	// the rows in order, what the combobox navigates
	options: ComboboxOption<string>[];
};

export function searchOptions(query: string, matches: PlaceSearchMatch[]): SearchOptionSet {
	let text: ComboboxOption<string> | null = null;
	const trimmed = query.trim();
	if (trimmed.length >= MIN_QUERY_LENGTH) {
		text = { value: `${TEXT_PREFIX}${trimmed}`, label: trimmed };
	}
	const places = matches.map((match) => ({
		option: { value: `${PLACE_PREFIX}${match.placeId}`, label: formatPlaceTitle(match) },
		match
	}));
	const options: ComboboxOption<string>[] = [];
	if (text) {
		options.push(text);
	}
	for (const place of places) {
		options.push(place.option);
	}
	return { text, places, options };
}

export function parseSearchChoice(value: string): SearchChoice | null {
	if (value.startsWith(TEXT_PREFIX)) {
		return { kind: 'text', query: value.slice(TEXT_PREFIX.length) };
	}
	if (value.startsWith(PLACE_PREFIX)) {
		return { kind: 'place', placeId: value.slice(PLACE_PREFIX.length) };
	}
	return null;
}
