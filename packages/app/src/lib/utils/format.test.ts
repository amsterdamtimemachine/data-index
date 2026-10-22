import { describe, test, expect } from 'vitest';
import type { PlaceSearchMatch } from '@atm/shared/types';
import { formatPlaceWindow, formatPlaceTitle, formatPartialDate, formatPeriod, foldLinesInline, subjectPhrase, formatNowKnownAs } from './format';

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
		recordedWindow: null,
		...overrides
	};
}

describe('formatPlaceWindow', () => {
	test("a street or area's window is its existence", () => {
		expect(formatPlaceWindow(match({ geometryWindow: ['1850-01-01', '1909-12-31'] }))).toBe('bestond 1850 tot 1909');
		expect(formatPlaceWindow(match({ geometryWindow: ['1921-01-01', null] }))).toBe('bestaat vanaf 1921');
		expect(formatPlaceWindow(match({ geometryWindow: [null, '1850-01-01'] }))).toBe('bestond tot 1850');
	});

	test("a street's old name carries the years it held", () => {
		const m = match({ matchedNameId: 'n', matchedWindow: ['1850-01-01', '1943-01-01'], geometryWindow: ['1600-01-01', null] });
		expect(formatPlaceWindow(m)).toBe('naam 1850 tot 1943');
		expect(formatPlaceWindow(match({ matchedNameId: 'n', matchedWindow: [null, '1850-01-01'] }))).toBe('naam tot 1850');
	});

	test('an address shows the registers it was noted on: the matched record, else all of them', () => {
		const record = match({ type: 'address', matchedNameId: 'n', matchedWindow: ['1853-01-01', '1853-12-31'], recordedWindow: ['1832-01-01', '1943-12-31'] });
		expect(formatPlaceWindow(record)).toBe('vermeld in 1853');
		const span = match({ type: 'address', recordedWindow: ['1832-01-01', '1943-12-31'] });
		expect(formatPlaceWindow(span)).toBe('vermeld 1832 tot 1943');
	});

	test('a place from a current register reads "huidig"; an undated Adamlink place nothing', () => {
		expect(formatPlaceWindow(match({ type: 'address', source: 'bag' }))).toBe('huidig');
		expect(formatPlaceWindow(match({ source: 'nwb' }))).toBe('huidig');
		expect(formatPlaceWindow(match({ type: 'neighbourhood', source: 'cbs' }))).toBe('huidig');
		expect(formatPlaceWindow(match({}))).toBe('');
	});

	test('a historical-name match shows that name\'s window, not the place\'s', () => {
		const m = match({
			matchedNameId: 'n',
			matchedWindow: [null, '1943-01-01'],
			geometryWindow: ['1850-01-01', '1909-12-31']
		});
		expect(formatPlaceWindow(m)).toBe('naam tot 1943');
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


describe('foldLinesInline', () => {
	test('rejoins hyphenated words and turns line breaks into spaces, keeping the edges', () => {
		expect(foldLinesInline('Om 11 uur gaan de cursisten gezame-\nlijk materiaal maken.\nZe komen aldoor.\n')).toBe('Om 11 uur gaan de cursisten gezamelijk materiaal maken. Ze komen aldoor. ');
	});

	test('a blank line stays a paragraph break', () => {
		expect(foldLinesInline('1940.\nEen Woord Tot de Jongeren\n\n"Ik wens hen te wijzen\nop de grote verantwoorde-\nlijkheid.')).toBe('1940. Een Woord Tot de Jongeren\n\n"Ik wens hen te wijzen op de grote verantwoordelijkheid.');
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

describe('subjectPhrase', () => {
	test('a cell, a place in one cell, a place across cells', () => {
		expect(subjectPhrase({ kind: 'cell', cellId: '3_4' })).toBe('van deze cel');
		expect(subjectPhrase({ kind: 'place', place: match({ name: 'Kalverstraat', matchedName: 'Kalverstraat', cells: [1] }) })).toBe('van de cel van Kalverstraat');
		expect(subjectPhrase({ kind: 'place', place: match({ name: 'Kalverstraat', matchedName: 'Kalverstraat', cells: [1, 2] }) })).toBe('van de cellen van Kalverstraat');
	});
});

describe('formatNowKnownAs', () => {
	test('the whole phrase comes from the translation, the name filled in', () => {
		expect(formatNowKnownAs('Dam')).toBe('(nu Dam)');
	});
});
