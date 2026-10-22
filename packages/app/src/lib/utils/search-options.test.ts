import { describe, test, expect } from 'vitest';
import type { PlaceSearchMatch } from '@atm/shared/types';
import { searchOptions, parseSearchChoice } from './search-options';

function match(overrides: Partial<PlaceSearchMatch>): PlaceSearchMatch {
	return {
		placeId: 'p',
		name: 'Kerkstraat',
		type: 'street',
		source: 'adamlink',
		matchedName: 'Kerkstraat',
		matchedNameId: null,
		matchedWindow: null,
		geometryWindow: null,
		featureCount: 0,
		cells: [],
		recordedWindow: null,
		...overrides
	};
}

describe('searchOptions', () => {
	test('text row first, then the places in the order served', () => {
		const set = searchOptions(' kerk ', [
			match({ placeId: 'a' }),
			match({ placeId: 'b', name: 'Kerkplein', matchedName: 'Kerkplein' })
		]);
		expect(set.text).toEqual({ value: 'q:kerk', label: 'kerk' });
		expect(set.places.map((p) => p.option)).toEqual([
			{ value: 'place:a', label: 'Kerkstraat' },
			{ value: 'place:b', label: 'Kerkplein' }
		]);
		expect(set.options.map((o) => o.value)).toEqual(['q:kerk', 'place:a', 'place:b']);
	});

	test('a one-letter query has no text row', () => {
		const set = searchOptions('k', [match({})]);
		expect(set.text).toBeNull();
		expect(set.options.map((o) => o.value)).toEqual(['place:p']);
	});
});

describe('parseSearchChoice', () => {
	test('reads a kind back from the value', () => {
		expect(parseSearchChoice('q:kerk')).toEqual({ kind: 'text', query: 'kerk' });
		expect(parseSearchChoice('place:p1')).toEqual({ kind: 'place', placeId: 'p1' });
		expect(parseSearchChoice('other')).toBeNull();
	});
});
