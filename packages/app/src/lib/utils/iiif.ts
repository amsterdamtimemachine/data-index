/**
 * Image URLs on a IIIF server: the scan's address, then which part of it and at what
 * size. A diary image is a box on a page scan, so the server cuts it on request.
 */
import type { ExcerptImage } from '@atm/shared/types';

/** The image's box from its scan, at `size`: "max", or "w," / ",h" for a width or height in pixels. */
export function iiifImageUrl(image: ExcerptImage, size = 'max'): string {
	return `${image.source}/${image.region}/${size}/0/default.jpg`;
}
