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

/** The day and month of a partial date, for rows under a year: "5 januari", "januari", or nothing for a bare year. */
export function formatDateInYear(date: string): string {
	const match = date.match(/^(\d{4})(?:-(\d{2}))?(?:-(\d{2}))?$/);
	if (!match) return date;
	const [, , month, day] = match;
	if (!month) return '';
	const monthName = translate(MONTH_KEYS[parseInt(month, 10) - 1] ?? '');
	if (!day) return monthName;
	return `${parseInt(day, 10)} ${monthName}`;
}

/** A year as an inclusive date window, the shape the date-windowed APIs take. */
export function yearWindow(year: number): { start: string; end: string } {
	return { start: `${year}-01-01`, end: `${year}-12-31` };
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
