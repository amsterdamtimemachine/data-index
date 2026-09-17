/**
 * Pausing the text search is view state, not part of the address: the chip keeps
 * the term, every fetch drops it. Remembering the paused term means a new or
 * cleared term un-pauses by itself, while other filter changes keep it.
 */
import type { FilterState } from '$types/filters';

export function createSearchPause(getFilters: () => FilterState) {
	let pausedTerm = $state<string | null>(null);
	const paused = $derived(pausedTerm !== null && pausedTerm === getFilters().searchQuery);

	// what the fetches, the panel and the collapsed line see: the filters minus a paused term
	const activeFilters = $derived.by(() => {
		const filters = getFilters();
		if (!paused) {
			return filters;
		}
		return { ...filters, searchQuery: null };
	});

	function toggle() {
		if (paused) {
			pausedTerm = null;
		} else {
			pausedTerm = getFilters().searchQuery;
		}
	}

	return {
		get paused() {
			return paused;
		},
		get activeFilters() {
			return activeFilters;
		},
		toggle
	};
}
