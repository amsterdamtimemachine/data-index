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

/**
 * Era label for a place search match: the period of the name the row shows. A match
 * on the current name carries the place's own window (a street's existence, a
 * division's years in force); a match on a historical name row carries that row's
 * window, so an undated variant carries none. "1850 tot 1909", "in 1853" (both ends
 * in one year), "tot 1850", "vanaf 1921", or '' without a window.
 */
export function formatPlaceWindow(match: PlaceSearchMatch): string {
	let window = match.geometryWindow;
	if (match.matchedNameId) {
		window = match.matchedWindow;
	}
	if (!window) {
		return '';
	}
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
