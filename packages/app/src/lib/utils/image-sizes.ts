/**
 * The picture URL for where it is shown: a card in the grid, or the full view. Each
 * image server sizes pictures its own way; this is the one place that knows them.
 * Both fit the picture inside the box, keeping its shape, and never enlarge it.
 */
import type { ExcerptImage } from '@atm/shared/types';
import { memorixThumbUrl } from './memorix';
import { iiifImageUrl } from './iiif';

export type PictureUse = 'card' | 'full';

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
