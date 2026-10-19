import { describe, test, expect } from 'vitest';
import { resultsSentence, mapSentence, periodValueText } from './announcements';

describe('resultsSentence', () => {
	test('several pages: the page first, then the count and the subject', () => {
		expect(resultsSentence(1204, 3, 100, 'van deze cel')).toBe('Pagina 3 van 13, 1204 features van deze cel');
	});

	test('a single page has no page part', () => {
		expect(resultsSentence(26, 1, 100, 'van de cel van Kalverstraat')).toBe('26 features van de cel van Kalverstraat');
	});

	test('one feature and none are worded as such', () => {
		expect(resultsSentence(1, 1, 100, 'van deze cel')).toBe('1 feature van deze cel');
		expect(resultsSentence(0, 1, 100, 'van deze cel')).toBe('Geen features van deze cel');
	});
});

describe('mapSentence', () => {
	test("the map's total under the filters", () => {
		expect(mapSentence(980)).toBe('980 features gevonden');
		expect(mapSentence(0)).toBe('Geen features gevonden');
	});
});

describe('periodValueText', () => {
	test("the period and its city-wide count, and the selection's count when there is one", () => {
		expect(periodValueText('1900–1950', 1204, null, null)).toBe('1900–1950, 1204 features');
		expect(periodValueText('1900–1950', 1204, null, 312)).toBe('1900–1950, 1204 features, 312 features in de selectie');
	});

	test("with the selection's own series on screen, only its count", () => {
		expect(periodValueText('1900–1950', 1204, 1, null)).toBe('1900–1950, 1 feature in de selectie');
		expect(periodValueText('1900–1950', 0, 0, null)).toBe('1900–1950, geen features in de selectie');
	});
});
