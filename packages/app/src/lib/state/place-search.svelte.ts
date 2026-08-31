/** Reactive fetcher for place-name search. */
import debounce from 'lodash.debounce';
import type { PlaceSearchMatch } from '@atm/shared/types';
import { addToast } from '$state/toaster.svelte';
import { translate } from '$utils/translations';

const DEBOUNCE_MS = 300;
const RESULT_LIMIT = 10;

export function createPlaceSearch() {
	let matches = $state<PlaceSearchMatch[]>([]);
	// last-wins: a stale response must not overwrite a newer one
	let requestId = 0;
	// one toast per failure burst — typing keeps firing requests, reset on success
	let hasReportedFailure = false;

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
			hasReportedFailure = false;
		} catch (err) {
			console.error('Place search failed:', err);
			if (id !== requestId) {
				return;
			}
			matches = [];
			if (!hasReportedFailure) {
				hasReportedFailure = true;
				addToast({
					data: {
						title: translate('Place Search Failed'),
						description: translate('Could not search places. Please try again later.'),
						type: 'error'
					}
				});
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
