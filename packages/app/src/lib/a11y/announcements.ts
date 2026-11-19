/**
 * The sentences screen readers hear when results change, worded for speech: no
 * ranges or slashes, the new part first so it can be cut off early.
 */
import { translate } from '#lib/utils/translations.js';
import { totalPages } from '#lib/utils/pagination.js';

function countWords(count: number): string {
	if (count === 0) {
		return `${translate('none')} ${translate('featureMany')}`;
	}
	if (count === 1) {
		return `1 ${translate('featureOne')}`;
	}
	return `${count} ${translate('featureMany')}`;
}

/** The panel's list: "Pagina 3 van 12, 1204 features van deze cel"; no page part on a single page. */
export function resultsSentence(count: number, page: number, pageSize: number, subject: string): string {
	const sentence = `${countWords(count)} ${subject}`;
	const pages = totalPages(count, pageSize);
	if (pages > 1) {
		return `${translate('page')} ${page} ${translate('outOf')} ${pages}, ${sentence}`;
	}
	return sentence;
}

/** The map's total under the current filters: "980 features gevonden". */
export function mapSentence(count: number): string {
	return `${countWords(count)} ${translate('found')}`;
}

/**
 * The timeline slider's spoken value, the same counts its hover tooltip shows: the
 * period with its city-wide count and, with a cell or place selected, the selection's
 * count; while the selection's own series is on screen, only the selection's count.
 */
export function periodValueText(label: string, count: number, localCount: number | null, selectionCount: number | null): string {
	const inSelection = translate('inSelection');
	if (localCount !== null) {
		return `${label}, ${midSentence(countWords(localCount))} ${inSelection}`;
	}
	let text = `${label}, ${midSentence(countWords(count))}`;
	if (selectionCount !== null) {
		text = `${text}, ${midSentence(countWords(selectionCount))} ${inSelection}`;
	}
	return text;
}

// "Geen features" after a comma reads "geen features"
function midSentence(words: string): string {
	return words.charAt(0).toLowerCase() + words.slice(1);
}
