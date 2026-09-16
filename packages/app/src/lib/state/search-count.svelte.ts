/** Reactive fetcher for the text-search preview count. */
import debounce from 'lodash.debounce';

const DEBOUNCE_MS = 300;
const MIN_QUERY_LENGTH = 2;

export function createSearchCount() {
	let count = $state<number | null>(null);
	// last-wins: a stale response must not overwrite a newer one
	let requestId = 0;

	const run = debounce(async (q: string, filterQuery: string) => {
		const id = ++requestId;
		try {
			// ride on the current filters so the preview matches what apply will show
			const params = new URLSearchParams(filterQuery);
			params.set('q', q);
			const response = await fetch(`/api/histogram?${params}`);
			if (!response.ok) {
				throw new Error(`HTTP ${response.status}`);
			}
			const data = await response.json();
			if (id !== requestId) {
				return;
			}
			count = data.totalFeatures ?? 0;
		} catch (err) {
			// preview only: degrade to no status line; the apply path surfaces errors
			console.error('Search count failed:', err);
			if (id === requestId) {
				count = null;
			}
		}
	}, DEBOUNCE_MS);

	function setQuery(q: string, filterQuery: string) {
		const trimmed = q.trim();
		if (trimmed.length < MIN_QUERY_LENGTH) {
			run.cancel();
			requestId++;
			count = null;
			return;
		}
		run(trimmed, filterQuery);
	}

	return {
		get count() {
			return count;
		},
		setQuery
	};
}
