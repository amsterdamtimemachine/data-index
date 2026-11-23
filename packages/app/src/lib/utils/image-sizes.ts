/**
 * The picture URL for where it is shown: a card in the grid, or the full view. Each
 * image server sizes pictures its own way; this is the one place that knows them.
 * Both fit the picture inside the box, keeping its shape, and never enlarge it.
 */
import type { ExcerptImage } from '@atm/shared/types';
import { iiifImageUrl } from './iiif';

// Beeldbank pictures come as Memorix thumbnail URLs, images.memorix.nl/<tenant>/thumb/<box>/<id>.jpg,
// where the box is one of the server's fixed sizes; the same id serves every size
const MEMORIX_HOST = 'images.memorix.nl';
const THUMB_SEGMENT = 'thumb';

/** The same picture at another of the server's sizes, e.g. "640x480" or "1000x1000"; any other URL unchanged. */
export function memorixThumbUrl(url: string, box: string): string {
	let parsed: URL;
	try {
		parsed = new URL(url);
	} catch {
		return url;
	}
	if (parsed.hostname !== MEMORIX_HOST) {
		return url;
	}
	const parts = parsed.pathname.split('/');
	const thumb = parts.indexOf(THUMB_SEGMENT);
	if (thumb === -1 || thumb + 2 >= parts.length) {
		return url;
	}
	parts[thumb + 1] = box;
	parsed.pathname = parts.join('/');
	return parsed.toString();
}

export type PictureUse = 'card' | 'full';

/** Where a card's picture is shown: in the grid, or expanded in the full view. */
export function pictureUse(expanded: boolean): PictureUse {
	if (expanded) {
		return 'full';
	}
	return 'card';
}

const MEMORIX_BOX: Record<PictureUse, string> = { card: '640x480', full: '1000x1000' };
const IIIF_SIZE: Record<PictureUse, string> = { card: '!640,480', full: '!1000,1000' };

/** A feature's picture, as its source links it; a link no known server makes comes back as is. */
export function getPictureUrl(url: string, use: PictureUse): string {
	return memorixThumbUrl(url, MEMORIX_BOX[use]);
}

/** A drawing from a diary page, cut from its scan on the Diaries IIIF server. */
export function getExcerptImageUrl(image: ExcerptImage, use: PictureUse): string {
	return iiifImageUrl(image, IIIF_SIZE[use]);
}
