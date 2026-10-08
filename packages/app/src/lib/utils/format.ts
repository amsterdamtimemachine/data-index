import type { PlaceSearchMatch } from '@atm/shared/types';
import { translate } from './translations';

export function formatTimePeriod(per: [number, number]): string {
	const [start, end] = per;
	if (start === end) return start.toString();
	return `${start}-${end}`;
}

/**
 * Format ISO date string (YYYY-MM-DD) to DD. MM. YYYY
 * Returns the original string if it can't be parsed.
 */
export function formatDate(date: string): string {
	const match = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
	if (!match) return date;
	return `${match[3]}. ${match[2]}. ${match[1]}`;
}

/**
 * Format a date range string (start/end) to DD. MM. YYYY / DD. MM. YYYY
 * Handles single dates and ranges.
 */
export function formatDateRange(date: string): string {
	if (date.includes('/')) {
		return date.split('/').map(formatDate).join(' / ');
	}
	return formatDate(date);
}

const MONTH_KEYS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

/**
 * Word a date at the precision it was recorded: "5 januari 1934" for YYYY-MM-DD,
 * "januari 1934" for YYYY-MM, "1934" for YYYY. Anything else comes back as is.
 */
export function formatPartialDate(date: string): string {
	const match = date.match(/^(\d{4})(?:-(\d{2}))?(?:-(\d{2}))?$/);
	if (!match) return date;
	const [, year, month, day] = match;
	if (!month) return year;
	const monthName = translate(MONTH_KEYS[parseInt(month, 10) - 1] ?? '');
	if (!day) return `${monthName} ${year}`;
	return `${parseInt(day, 10)} ${monthName} ${year}`;
}

function lastDayOfMonth(year: number, month: number): number {
	return new Date(Date.UTC(year, month, 0)).getUTCDate();
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
	const s = start.match(/^(\d{4})-(\d{2})-(\d{2})$/);
	const e = end.match(/^(\d{4})-(\d{2})-(\d{2})$/);
	if (!s || !e) {
		return `${start} ${translate('windowUntil')} ${end}`;
	}
	const sameYear = s[1] === e[1];
	if (sameYear && s[2] === '01' && s[3] === '01' && e[2] === '12' && e[3] === '31') {
		return s[1];
	}
	const lastDay = lastDayOfMonth(parseInt(e[1], 10), parseInt(e[2], 10));
	if (sameYear && s[2] === e[2] && s[3] === '01' && parseInt(e[3], 10) === lastDay) {
		return formatPartialDate(`${s[1]}-${s[2]}`);
	}
	return `${formatPartialDate(start)} ${translate('windowUntil')} ${formatPartialDate(end)}`;
}

/**
 * A transcription's lines as prose: a word broken over two lines with a hyphen is
 * rejoined, a blank line stays a paragraph break, every other line break becomes a
 * space. The stored text keeps the page's lines; this is how the card reads it.
 */
export function foldLines(text: string): string {
	return text
		.replace(/-\n(?!\n)/g, '')
		.replace(/\n{2,}/g, '\u0000')
		.replace(/\n/g, ' ')
		.replace(/\u0000/g, '\n\n')
		.trim();
}

export function formatDatasetTitle(title: string): string {
	return title
		.replace(/_/g, ' ')
		.split(' ')
		.map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
		.join(' ');
}

/**
 * A place as the UI names it: the matched (possibly historical) name, else the current
 * one, else the id — followed by "(nu <current>)" when the shown name is an old one.
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
		return `${shown} (${translate('nowKnownAs')} ${match.name})`;
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
/** The name a place is shown under: the matched (possibly historical) name, else the current one, else the id. */
export function formatPlaceName(match: PlaceSearchMatch): string {
	if (match.matchedName) {
		return match.matchedName;
	}
	if (match.name) {
		return match.name;
	}
	return match.placeId;
}

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
