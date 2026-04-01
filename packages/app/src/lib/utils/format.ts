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

export function formatDatasetTitle(title: string): string {
	return title
		.replace(/_/g, ' ')
		.split(' ')
		.map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
		.join(' ');
}
