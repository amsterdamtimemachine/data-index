import { describe, test, expect } from 'vitest';
import type { VisualizationMetadata } from '@atm/shared/types';
import { parseFilterState, filterParams, selectsAll } from './filters';

const metadata: VisualizationMetadata = {
	timeSlices: [],
	recordTypes: ['image', 'text'],
	placeTypes: ['address', 'street'],
	datasets: [
		{ id: 'beeldbank', label: 'Beeldbank' },
		{ id: 'delpher', label: 'Delpher' }
	],
	tags: ['bridge_canal', 'maps']
};

function url(qs: string): URL {
	return new URL(`http://x/?${qs}`);
}

describe('parseFilterState', () => {
	test('absent params select everything, with no errors', () => {
		const { filters, errors } = parseFilterState(url(''), metadata);
		expect(filters).toEqual({
			recordTypes: ['image', 'text'],
			datasets: ['beeldbank', 'delpher'],
			placeTypes: ['address', 'street'],
			tags: [],
			tagOperator: 'OR',
			searchQuery: null
		});
		expect(errors).toEqual([]);
	});

	test('keeps valid values and reports invalid record types and tags', () => {
		const { filters, errors } = parseFilterState(url('recordTypes=image,video&tags=maps,nope&tagOperator=and&q=brug'), metadata);
		expect(filters.recordTypes).toEqual(['image']);
		expect(filters.tags).toEqual(['maps']);
		expect(filters.tagOperator).toBe('AND');
		expect(filters.searchQuery).toBe('brug');
		expect(errors.map((e) => e.title)).toEqual(['Ongeldig inhoudstype verwijderd', 'Ongeldig onderwerp verwijderd']);
	});

	test('a category with nothing valid falls back to everything', () => {
		const { filters, errors } = parseFilterState(url('recordTypes=video&datasets=nope&placeTypes=nope'), metadata);
		expect(filters.recordTypes).toEqual(['image', 'text']);
		expect(filters.datasets).toEqual(['beeldbank', 'delpher']);
		expect(filters.placeTypes).toEqual(['address', 'street']);
		expect(errors).toHaveLength(1); // only record types warn
	});

	test('without metadata the categories stay empty but search and operator still parse', () => {
		const { filters } = parseFilterState(url('recordTypes=image&q=brug&tags=maps&tagOperator=AND'), null);
		expect(filters.recordTypes).toEqual([]);
		expect(filters.tags).toEqual([]);
		expect(filters.searchQuery).toBe('brug');
		expect(filters.tagOperator).toBe('AND');
	});
});

describe('filterParams', () => {
	test('omits categories that select everything and carries tags with their operator', () => {
		const { filters } = parseFilterState(url('datasets=delpher&tags=maps&q=brug'), metadata);
		expect(filterParams(filters, metadata).toString()).toBe('datasets=delpher&q=brug&tags=maps&tagOperator=OR');
	});

	test('round-trips a partial selection', () => {
		const qs = 'recordTypes=text&placeTypes=street&tags=bridge_canal%2Cmaps&tagOperator=AND';
		const { filters } = parseFilterState(url(qs), metadata);
		expect(filterParams(filters, metadata).toString()).toBe('recordTypes=text&placeTypes=street&tags=bridge_canal%2Cmaps&tagOperator=AND');
	});

	test('without metadata every non-empty list is sent', () => {
		const { filters } = parseFilterState(url(''), metadata);
		expect(filterParams(filters).toString()).toBe('recordTypes=image%2Ctext&datasets=beeldbank%2Cdelpher&placeTypes=address%2Cstreet');
	});
});

describe('selectsAll', () => {
	test('empty, complete and partial selections', () => {
		expect(selectsAll([], ['a', 'b'])).toBe(true);
		expect(selectsAll(['b', 'a'], ['a', 'b'])).toBe(true);
		expect(selectsAll(['a'], ['a', 'b'])).toBe(false);
	});
});
