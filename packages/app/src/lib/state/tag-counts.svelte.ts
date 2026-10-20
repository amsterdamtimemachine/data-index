/** Reactive fetcher for the per-tag counts shown in the filter panel. */
import type { AvailableTags } from '@atm/shared/types';
import { apiUrl } from '#lib/utils/api.js';
import { notifyFailure } from '#lib/state/notify.js';

export function createTagCounts() {
	// tag id → features carrying it under the current filters; null until loaded or after a failure
	let counts = $state<Map<string, number> | null>(null);
	// last-wins: a stale response must not overwrite a newer one
	let requestId = 0;

	async function load(filterQuery: string) {
		const id = ++requestId;
		try {
			const response = await fetch(apiUrl('/api/available-tags', new URLSearchParams(filterQuery)));
			if (!response.ok) {
				throw response;
			}
			const data: AvailableTags = await response.json();
			if (id !== requestId) {
				return;
			}
			counts = new Map(data.tags.map((tag) => [tag.id, tag.count]));
		} catch (err) {
			if (id !== requestId) {
				return;
			}
			// the chips still work without counts
			counts = null;
			notifyFailure('topicCountsNotLoaded', err);
		}
	}

	return {
		get counts() {
			return counts;
		},
		load
	};
}
