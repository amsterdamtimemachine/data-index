/**
 * Shared parsing for the comma-separated list filters every data API endpoint
 * accepts (recordTypes, datasets, placeTypes, tags, ...). Returns `undefined`
 * when the param is absent or empty so it maps straight onto the optional query
 * arguments in @atm/db.
 */
import type { RecordType, PlaceType } from '@atm/shared/types';

/** Parse a comma-separated query param into a trimmed string[], or undefined. */
export function parseList(url: URL, name: string): string[] | undefined {
	const raw = url.searchParams.get(name);
	if (!raw) return undefined;
	const items = raw.split(',').map((s) => s.trim()).filter((s) => s.length > 0);
	return items.length > 0 ? items : undefined;
}

export function parseRecordTypes(url: URL): RecordType[] | undefined {
	return parseList(url, 'recordTypes') as RecordType[] | undefined;
}

export function parsePlaceTypes(url: URL): PlaceType[] | undefined {
	return parseList(url, 'placeTypes') as PlaceType[] | undefined;
}

export function parseDatasets(url: URL): string[] | undefined {
	return parseList(url, 'datasets');
}
