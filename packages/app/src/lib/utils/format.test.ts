import { describe, test, expect } from 'vitest';
import type { PlaceSearchMatch } from '@atm/shared/types';
import { formatPlaceWindow, formatPlaceName, formatPlaceTitle, formatPartialDate, formatPeriod, foldLines } from './format';

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
	test('a current-name match shows the place window', () => {
		expect(formatPlaceWindow(match({ geometryWindow: ['1850-01-01', '1909-12-31'] }))).toBe('1850 tot 1909');
	});

	test('both ends in one year render "in"', () => {
		const m = match({ matchedNameId: 'n', matchedWindow: ['1853-01-01', '1853-12-31'] });
		expect(formatPlaceWindow(m)).toBe('in 1853');
	});

	test('until-only renders "tot"', () => {
		expect(formatPlaceWindow(match({ matchedNameId: 'n', matchedWindow: [null, '1850-01-01'] }))).toBe('tot 1850');
	});

	test('since-only renders "vanaf"', () => {
		expect(formatPlaceWindow(match({ geometryWindow: ['1921-01-01', null] }))).toBe('vanaf 1921');
	});

	test('no window renders nothing', () => {
		expect(formatPlaceWindow(match({}))).toBe('');
	});

	test('a historical-name match shows that name\'s window, not the place\'s', () => {
		const m = match({
			matchedNameId: 'n',
			matchedWindow: [null, '1943-01-01'],
			geometryWindow: ['1850-01-01', '1909-12-31']
		});
		expect(formatPlaceWindow(m)).toBe('tot 1943');
	});

	test('an undated variant shows no window even when the place has one', () => {
		const m = match({ matchedNameId: 'n', matchedWindow: null, geometryWindow: ['1923-01-01', null] });
		expect(formatPlaceWindow(m)).toBe('');
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

describe('formatPlaceName', () => {
	test('prefers the matched name, then the current name, then the id', () => {
		expect(formatPlaceName(match({ matchedName: 'Oude naam', name: 'Nieuwe naam' }))).toBe('Oude naam');
		expect(formatPlaceName(match({ matchedName: '', name: 'Nieuwe naam' }))).toBe('Nieuwe naam');
		expect(formatPlaceName(match({ matchedName: '', name: null }))).toBe('p');
	});
});

describe('formatPartialDate', () => {
	test('words a date at the precision it was recorded', () => {
		expect(formatPartialDate('1934-01-05')).toBe('5 januari 1934');
		expect(formatPartialDate('1907-05')).toBe('mei 1907');
		expect(formatPartialDate('1928')).toBe('1928');
	});

	test('leaves anything it cannot read as it is', () => {
		expect(formatPartialDate('1910-01-174')).toBe('1910-01-174');
	});
});


describe('foldLines', () => {
	test('rejoins hyphenated words and turns line breaks into spaces', () => {
		expect(foldLines('Om 11 uur gaan de cursisten gezame-\nlijk materiaal maken.\nZe komen aldoor.\n')).toBe('Om 11 uur gaan de cursisten gezamelijk materiaal maken. Ze komen aldoor.');
	});

	test('a blank line stays a paragraph break', () => {
		expect(foldLines('1940.\nEen Woord Tot de Jongeren\n\n"Ik wens hen te wijzen\nop de grote verantwoorde-\nlijkheid.')).toBe('1940. Een Woord Tot de Jongeren\n\n"Ik wens hen te wijzen op de grote verantwoordelijkheid.');
	});
});

describe('formatPeriod', () => {
	test('words a period at the precision its dates show', () => {
		expect(formatPeriod('1934-01-05', '1934-01-05')).toBe('5 januari 1934');
		expect(formatPeriod('1907-05-01', '1907-05-31')).toBe('mei 1907');
		expect(formatPeriod('1928-01-01', '1928-12-31')).toBe('1928');
		expect(formatPeriod('1934-01-05', '1935-03-02')).toBe('5 januari 1934 tot 2 maart 1935');
	});
});
