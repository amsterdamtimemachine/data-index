/**
 * Shared parsing for the comma-separated list filters every data API endpoint
 * accepts (recordTypes, datasets, placeTypes, tags, ...). Returns `undefined`
 * when the param is absent or empty so it maps straight onto the optional query
 * arguments in @atm/db.
 */
import { error } from '@sveltejs/kit';
import type { RecordType, PlaceType } from '@atm/shared/types';
import { MAX_FILTER_ITEMS } from '@atm/shared';

/**
 * Parse a comma-separated query param into a trimmed string[], or undefined.
 * Capped at MAX_FILTER_ITEMS so a caller can't force an oversized IN (…) / tag query.
 */
export function parseList(url: URL, name: string): string[] | undefined {
	const raw = url.searchParams.get(name);
	if (!raw) return undefined;
	const items = raw.split(',').map((s) => s.trim()).filter((s) => s.length > 0).slice(0, MAX_FILTER_ITEMS);
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

/** Shuffle seed for the sample sort — any string, capped so it can't bloat the query. */
export function parseSeed(url: URL): string | undefined {
	const raw = url.searchParams.get('seed');
	if (!raw) {
		return undefined;
	}
	return raw.slice(0, 64);
}

export type Bounds = { minLon: number; maxLon: number; minLat: number; maxLat: number };

/**
 * Parse the minLon/maxLon/minLat/maxLat quartet. Returns undefined when not all
 * four are present (callers decide whether bounds are required); throws a 400 for
 * non-numeric values or an inverted/degenerate box — rejecting those up front
 * beats doing a grid lookup + empty query for a box that can never contain
 * anything. Shared by the features and histogram endpoints so "a bounds param"
 * always means the same thing.
 */
export function parseBounds(url: URL): Bounds | undefined {
	const minLon = url.searchParams.get('minLon');
	const maxLon = url.searchParams.get('maxLon');
	const minLat = url.searchParams.get('minLat');
	const maxLat = url.searchParams.get('maxLat');

	if (!minLon || !maxLon || !minLat || !maxLat) {
		return undefined;
	}

	const bounds = {
		minLon: parseFloat(minLon),
		maxLon: parseFloat(maxLon),
		minLat: parseFloat(minLat),
		maxLat: parseFloat(maxLat)
	};

	if (Object.values(bounds).some(isNaN)) {
		throw error(400, { code: 'INVALID_BOUNDS', message: 'Bounds must be valid numbers' });
	}
	if (bounds.minLon >= bounds.maxLon || bounds.minLat >= bounds.maxLat) {
		throw error(400, {
			code: 'INVALID_BOUNDS',
			message: 'Bounds must have minLon < maxLon and minLat < maxLat'
		});
	}
	return bounds;
}
