/**
 * The sentences screen readers hear when results change, worded for speech: no
 * ranges or slashes, the new part first so it can be cut off early.
 */
import { translate } from './translations';
import { totalPages } from './pagination';

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
