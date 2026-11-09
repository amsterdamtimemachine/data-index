/** Reactive fetcher for the counts shown beside every filter value in the panel. */
import type { FilterCounts } from '@atm/shared/types';
import { apiUrl } from '#lib/utils/api.js';
import { notifyFailure } from '#lib/state/notify.js';

export function createFilterCounts() {
	// null until loaded or after a failure
	let counts = $state<FilterCounts | null>(null);
	// last-wins: a stale response must not overwrite a newer one
	let requestId = 0;

	async function load(query: string) {
		const id = ++requestId;
		try {
			const response = await fetch(apiUrl('/api/filter-counts', new URLSearchParams(query)));
			if (!response.ok) {
				throw response;
			}
			const data: FilterCounts = await response.json();
			if (id !== requestId) {
				return;
			}
			counts = data;
		} catch (err) {
			if (id !== requestId) {
				return;
			}
			// the filters still work without counts
			counts = null;
			notifyFailure('topicCountsNotLoaded', err);
		}
	}

	// nothing to count: no counts, and a response still under way is ignored
	function reset() {
		++requestId;
		counts = null;
	}

	return {
		get counts() {
			return counts;
		},
		load,
		reset
	};
}
