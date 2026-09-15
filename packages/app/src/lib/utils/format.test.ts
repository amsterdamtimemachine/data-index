import { describe, test, expect } from 'vitest';
import type { PlaceSearchMatch } from '@atm/shared/types';
import { formatPlaceWindow, formatPlaceTitle } from './format';

function match(overrides: Partial<PlaceSearchMatch>): PlaceSearchMatch {
	return {
		placeId: 'p',
		name: 'Test',
		type: 'street',
		source: 'adamlink',
		matchedName: 'Test',
		matchedNameId: null,
		matchedWindow: null,
		geometryWindow: null,
		featureCount: 0,
		cells: [],
		...overrides
	};
}

describe('formatPlaceWindow', () => {
	test('closed window renders "… tot …"', () => {
		expect(formatPlaceWindow(match({ geometryWindow: ['1850-01-01', '1909-12-31'] }))).toBe('1850 tot 1909');
	});

	test('until-only renders "tot"', () => {
		expect(formatPlaceWindow(match({ matchedWindow: [null, '1850-01-01'] }))).toBe('tot 1850');
	});

	test('since-only renders "vanaf"', () => {
		expect(formatPlaceWindow(match({ geometryWindow: ['1921-01-01', null] }))).toBe('vanaf 1921');
	});

	test('no window renders nothing', () => {
		expect(formatPlaceWindow(match({}))).toBe('');
	});

	test('the matched name window wins over the geometry window', () => {
		const m = match({
			matchedWindow: [null, '1943-01-01'],
			geometryWindow: ['1850-01-01', '1909-12-31']
		});
		expect(formatPlaceWindow(m)).toBe('tot 1943');
	});
});

describe('formatPlaceTitle', () => {
	test('a current-name match is just the name', () => {
		expect(formatPlaceTitle(match({ matchedName: 'Dam', name: 'Dam' }))).toBe('Dam');
	});

	test('an old name carries the current one', () => {
		expect(formatPlaceTitle(match({ matchedName: 'Plaetse', name: 'Dam' }))).toBe('Plaetse (nu Dam)');
	});

	test('falls back to the current name, then the id', () => {
		expect(formatPlaceTitle(match({ matchedName: '', name: 'Dam' }))).toBe('Dam');
		expect(formatPlaceTitle(match({ matchedName: '', name: null }))).toBe('p');
	});
});
