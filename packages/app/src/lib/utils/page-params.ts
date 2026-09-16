/**
 * Pure parsers for the map page's URL params (universal loader — no server-only
 * imports). Presentation knobs clamp; they never throw.
 */
import { UI_SORT_MODES, type UiSortMode } from './sort-modes';

const ID_MAX_LENGTH = 512;
const SEED_MAX_LENGTH = 64;

/** The place selection references: place id and, optionally, the clicked name row. */
export function parsePlaceSelection(url: URL): { placeId: string | null; nameId: string | null } {
	let placeId: string | null = null;
	const placeParam = url.searchParams.get('place');
	if (placeParam) {
		placeId = placeParam.slice(0, ID_MAX_LENGTH);
	}
	let nameId: string | null = null;
	const nameParam = url.searchParams.get('name');
	if (nameParam) {
		nameId = nameParam.slice(0, ID_MAX_LENGTH);
	}
	return { placeId, nameId };
}

/** The place-panel flag; only '1' opens it. */
export function parsePlacePanelFlag(url: URL): boolean {
	return url.searchParams.get('placePanel') === '1';
}

/**
 * Free-text feature search (`q`), mirroring the server-side parseSearchQuery:
 * trimmed, clamped, blank collapses to null (no filter).
 */
export function parseSearchQuery(url: URL): string | null {
	const raw = url.searchParams.get('q');
	if (!raw) {
		return null;
	}
	const trimmed = raw.trim().slice(0, ID_MAX_LENGTH);
	if (trimmed.length === 0) {
		return null;
	}
	return trimmed;
}

/** Sort mode (unknown modes fall back to the default) and shuffle seed. */
export function parseSortSelection(url: URL): { sort: UiSortMode; sampleSeed: string | undefined } {
	let sort: UiSortMode = 'sample';
	const sortParam = url.searchParams.get('sort');
	if (sortParam && (UI_SORT_MODES as string[]).includes(sortParam)) {
		sort = sortParam as UiSortMode;
	}
	let sampleSeed: string | undefined = undefined;
	const seedParam = url.searchParams.get('sampleSeed');
	if (seedParam) {
		sampleSeed = seedParam.slice(0, SEED_MAX_LENGTH);
	}
	return { sort, sampleSeed };
}
