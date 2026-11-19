import type { PlaceSearchMatch } from '@atm/shared/types';
import type { PanelSubject } from '#lib/state/panel-features.svelte.js';
import { translate, fill } from './translations';
import { parsePartialDate, periodAsPartialDate, type PartialDate } from '@atm/shared/dates';

export function formatTimePeriod(per: [number, number]): string {
	const [start, end] = per;
	if (start === end) return start.toString();
	return `${start}-${end}`;
}

const MONTH_KEYS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

/**
 * Word a date at the precision it was recorded: "5 januari 1934" for YYYY-MM-DD,
 * "januari 1934" for YYYY-MM, "1934" for YYYY. Anything else comes back as is.
 */
export function formatPartialDate(date: string): string {
	const parsed = parsePartialDate(date);
	if (!parsed) return date;
	return wordDate(parsed);
}

function wordDate(date: PartialDate): string {
	const { year, month, day } = date;
	if (!month) return String(year);
	const monthName = translate(MONTH_KEYS[month - 1] ?? '');
	if (!day) return `${monthName} ${year}`;
	return `${day} ${monthName} ${year}`;
}

/**
 * Word an inclusive period (YYYY-MM-DD) at the precision its dates show: one day
 * reads "5 januari 1934", a whole month "mei 1907", a whole year "1907", anything
 * else "5 januari 1934 tot 2 maart 1935".
 */
export function formatPeriod(start: string, end: string): string {
	if (start === end) {
		return formatPartialDate(start);
	}
	const whole = periodAsPartialDate(start, end);
	if (whole) {
		return wordDate(whole);
	}
	return `${formatPartialDate(start)} ${translate('windowUntil')} ${formatPartialDate(end)}`;
}

/**
 * A transcription's lines as prose: a word broken over two lines with a hyphen is
 * rejoined, a blank line stays a paragraph break, every other line break becomes a
 * space. The stored text keeps the page's lines; this is how the card reads it.
 */
/** Lines folded into prose: a hyphen break rejoined, a line break a space, a blank line a paragraph; the edges kept. */
export function foldLinesInline(text: string): string {
	return text
		.replace(/-\n(?!\n)/g, '')
		.replace(/\n{2,}/g, '\u0000')
		.replace(/\n/g, ' ')
		.replace(/\u0000/g, '\n\n');
}

export function formatDatasetTitle(title: string): string {
	return title
		.replace(/_/g, ' ')
		.split(' ')
		.map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
		.join(' ');
}

/** The phrase after an old place name naming the current one, worded by the translation: "(nu Dam)". */
export function formatNowKnownAs(currentName: string): string {
	return fill(translate('nowKnownAs'), { name: currentName });
}

/**
 * A place as the UI names it: the matched (possibly historical) name, else the current
 * one, else the id — followed by the current name when the shown name is an old one.
 */
export function formatPlaceTitle(match: PlaceSearchMatch): string {
	let shown = match.matchedName;
	if (!shown && match.name) {
		shown = match.name;
	}
	if (!shown) {
		shown = match.placeId;
	}
	if (match.name && match.name !== shown) {
		return `${shown} ${formatNowKnownAs(match.name)}`;
	}
	return shown;
}

// the registers of today: a place from one carries no dates of its own
const CURRENT_REGISTERS = new Set(['bag', 'nwb', 'cbs']);

// "in 1853" (both ends in one year), "1850 tot 1909", "tot 1850" or "vanaf 1921"
function windowYears(window: [string | null, string | null]): string {
	const [since, until] = window;
	if (since && until) {
		const sinceYear = since.slice(0, 4);
		const untilYear = until.slice(0, 4);
		if (sinceYear === untilYear) {
			return `${translate('windowIn')} ${sinceYear}`;
		}
		return `${sinceYear} ${translate('windowUntil')} ${untilYear}`;
	}
	if (until) {
		return `${translate('windowUntil')} ${until.slice(0, 4)}`;
	}
	if (since) {
		return `${translate('windowSince')} ${since.slice(0, 4)}`;
	}
	return '';
}

/**
 * What a place search row's years mean, in the source's terms. A street or area's
 * window is its existence: "bestaat vanaf 1663", "bestond 1850 tot 1909". A street's
 * old name carries the years it held: "naam 1850 tot 1943". An address has no
 * validity, only the registers it was noted on: "vermeld in 1853" for the matched
 * record, "vermeld 1832 tot 1943" over all of them. A place from a current register
 * carries no dates: "huidig". '' when the source gave none.
 */
export function formatPlaceWindow(match: PlaceSearchMatch): string {
	if (match.type === 'address') {
		let window = match.recordedWindow;
		if (match.matchedNameId && match.matchedWindow) {
			window = match.matchedWindow;
		}
		if (window) {
			return `${translate('recorded')} ${windowYears(window)}`;
		}
	} else if (match.matchedNameId) {
		if (match.matchedWindow) {
			return `${translate('nameHeld')} ${windowYears(match.matchedWindow)}`;
		}
	} else if (match.geometryWindow) {
		const [since, until] = match.geometryWindow;
		if (since && !until) {
			return `${translate('existsSince')} ${since.slice(0, 4)}`;
		}
		return `${translate('existed')} ${windowYears(match.geometryWindow)}`;
	}
	if (match.source && CURRENT_REGISTERS.has(match.source)) {
		return translate('currentRegister');
	}
	return '';
}

/** How the panel names what it lists: this cell, or the place's cells with the matched name. */
export function subjectPhrase(subject: PanelSubject): string {
	if (subject.kind === 'cell') {
		return translate('ofThisCell');
	}
	const place = subject.place;
	let phrase = translate('ofCellsOf');
	if (place.cells.length === 1) {
		phrase = translate('ofCellOf');
	}
	return `${phrase} ${formatPlaceTitle(place)}`;
}
