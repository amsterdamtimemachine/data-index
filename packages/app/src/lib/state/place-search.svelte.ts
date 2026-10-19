/** Reactive fetcher for place-name search. */
import debounce from 'lodash.debounce';
import type { PlaceSearchMatch } from '@atm/shared/types';
import { notifyFailure } from '$lib/state/notify';
import { apiUrl } from '$utils/api';
import { MIN_QUERY_LENGTH } from '$utils/search-options';

const DEBOUNCE_MS = 300;
const RESULT_LIMIT = 10;

export function createPlaceSearch() {
	let matches = $state<PlaceSearchMatch[]>([]);
	// last-wins: a stale response must not overwrite a newer one
	let requestId = 0;

	const run = debounce(async (q: string) => {
		const id = ++requestId;
		try {
			const response = await fetch(apiUrl('/api/places', new URLSearchParams({ q, limit: String(RESULT_LIMIT) })));
			if (!response.ok) {
				throw response;
			}
			const data = await response.json();
			if (id !== requestId) {
				return;
			}
			matches = data.matches || [];
		} catch (err) {
			if (id !== requestId) {
				return;
			}
			matches = [];
			notifyFailure('placeSearchFailed', err);
		}
	}, DEBOUNCE_MS);

	function setQuery(q: string) {
		if (q.trim().length < MIN_QUERY_LENGTH) {
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
