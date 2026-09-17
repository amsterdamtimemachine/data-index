/**
 * Pausing keeps the term in the URL's filters but drops it from the active ones;
 * a new or cleared term un-pauses by itself, other filter changes keep the pause.
 */
import { describe, test, expect } from 'vitest';
import type { FilterState } from '$types/filters';
import { createSearchPause } from './search-pause.svelte';

function filters(overrides: Partial<FilterState> = {}): FilterState {
	return { recordTypes: ['image'], datasets: [], placeTypes: [], tags: [], tagOperator: 'OR', searchQuery: 'bom', ...overrides };
}

describe('search pause', () => {
	test('starts applied: the active filters are the filters', () => {
		const state = $state({ filters: filters() });
		const pause = createSearchPause(() => state.filters);
		expect(pause.paused).toBe(false);
		expect(pause.activeFilters.searchQuery).toBe('bom');
	});

	test('pausing removes the term from the active filters and toggling brings it back', () => {
		const state = $state({ filters: filters() });
		const pause = createSearchPause(() => state.filters);
		pause.toggle();
		expect(pause.paused).toBe(true);
		expect(pause.activeFilters.searchQuery).toBeNull();
		expect(pause.activeFilters.recordTypes).toEqual(['image']);
		pause.toggle();
		expect(pause.paused).toBe(false);
		expect(pause.activeFilters.searchQuery).toBe('bom');
	});

	test('a new or cleared term un-pauses by itself', () => {
		const state = $state({ filters: filters() });
		const pause = createSearchPause(() => state.filters);
		pause.toggle();
		state.filters = filters({ searchQuery: 'brug' });
		expect(pause.paused).toBe(false);
		expect(pause.activeFilters.searchQuery).toBe('brug');
		pause.toggle();
		state.filters = filters({ searchQuery: null });
		expect(pause.paused).toBe(false);
	});

	test('other filter changes keep the pause', () => {
		const state = $state({ filters: filters() });
		const pause = createSearchPause(() => state.filters);
		pause.toggle();
		state.filters = filters({ recordTypes: ['text'] });
		expect(pause.paused).toBe(true);
		expect(pause.activeFilters.searchQuery).toBeNull();
		expect(pause.activeFilters.recordTypes).toEqual(['text']);
	});
});
