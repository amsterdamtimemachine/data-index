/**
 * Beeldbank pictures come as Memorix thumbnail URLs, images.memorix.nl/<tenant>/thumb/<box>/<id>.jpg,
 * where the box is one of the server's fixed sizes. The picture is scaled to fit inside
 * it, keeping its shape; the same id serves every size.
 */
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
