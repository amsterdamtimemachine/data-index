/** Reactive fetcher for the per-tag counts shown in the filter panel. */
import type { AvailableTags } from '@atm/shared/types';
import { apiUrl } from '$utils/api';
import { addToast } from '$state/toaster.svelte';
import { translate } from '$utils/translations';

export function createTagCounts() {
	// tag id → features carrying it under the current filters; null until loaded or after a failure
	let counts = $state<Map<string, number> | null>(null);
	// last-wins: a stale response must not overwrite a newer one
	let requestId = 0;
	let hasReportedFailure = false;

	async function load(filterQuery: string) {
		const id = ++requestId;
		try {
			const response = await fetch(apiUrl('/api/available-tags', new URLSearchParams(filterQuery)));
			if (!response.ok) {
				throw new Error(`HTTP ${response.status}`);
			}
			const data: AvailableTags = await response.json();
			if (id !== requestId) {
				return;
			}
			counts = new Map(data.tags.map((tag) => [tag.id, tag.count]));
		} catch (err) {
			console.error('Tag counts failed:', err);
			if (id !== requestId) {
				return;
			}
			counts = null;
			// once per session: the chips still work without counts
			if (!hasReportedFailure) {
				hasReportedFailure = true;
				addToast({
					data: {
						title: translate('Tag Counts Failed'),
						description: translate('Could not load the topic counts.'),
						type: 'error'
					}
				});
			}
		}
	}

	return {
		get counts() {
			return counts;
		},
		load
	};
}
