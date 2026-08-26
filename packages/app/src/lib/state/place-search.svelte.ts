/** Reactive fetcher for place-name search. */
import debounce from 'lodash.debounce';
import type { PlaceSearchMatch } from '@atm/shared/types';

const DEBOUNCE_MS = 300;
const RESULT_LIMIT = 10;

export function createPlaceSearch() {
	let matches = $state<PlaceSearchMatch[]>([]);
	// last-wins: a stale response must not overwrite a newer one
	let requestId = 0;

	const run = debounce(async (q: string) => {
		const id = ++requestId;
		try {
			const response = await fetch(`/api/places?q=${encodeURIComponent(q)}&limit=${RESULT_LIMIT}`);
			if (!response.ok) {
				throw new Error(`HTTP ${response.status}`);
			}
			const data = await response.json();
			if (id !== requestId) {
				return;
			}
			matches = data.matches || [];
		} catch (err) {
			console.error('Place search failed:', err);
			if (id === requestId) {
				matches = [];
			}
		}
	}, DEBOUNCE_MS);

	function setQuery(q: string) {
		if (q.trim().length < 2) {
			run.cancel();
			requestId++;
			matches = [];
			return;
		}
		run(q);
	}

	return {
		get matches() {
			return matches;
		},
		setQuery
	};
}
