import { describe, test, expect, afterEach } from 'vitest';
import { NL } from './translations/nl';
import { EN } from './translations/en';
import {
	translate,
	parseLanguage,
	withLanguage,
	setLanguageSource,
	hasTranslation,
	type Language
} from './translations';

afterEach(() => setLanguageSource(() => 'nl'));

function speak(language: Language) {
	setLanguageSource(() => language);
}

describe('translations', () => {
	test('both languages carry the same keys, none left empty', () => {
		expect(Object.keys(EN).sort()).toEqual(Object.keys(NL).sort());
		expect(Object.values(EN).every((v) => v.length > 0)).toBe(true);
	});

	test('every slot of a Dutch template is in its English one', () => {
		const slots = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort();
		for (const key of Object.keys(NL) as (keyof typeof NL)[]) {
			expect(slots(EN[key]), key).toEqual(slots(NL[key]));
		}
	});

	test('Dutch by default, English when the page asks; an unknown key comes back as it is', () => {
		expect(translate('image')).toBe('Afbeelding');
		speak('en');
		expect(translate('image')).toBe('Image');
		expect(translate('bridge_canal')).toBe('Bridge canal');
		expect(translate('not-a-key')).toBe('not-a-key');
		expect(hasTranslation('image')).toBe(true);
		expect(hasTranslation('not-a-key')).toBe(false);
	});

	test('the lang param: en is English, anything else the default', () => {
		expect(parseLanguage('en')).toBe('en');
		expect(parseLanguage('nl')).toBe('nl');
		expect(parseLanguage('de')).toBe('nl');
		expect(parseLanguage(null)).toBe('nl');
	});

	test('an internal link keeps the language; the default adds nothing', () => {
		expect(withLanguage('/about')).toBe('/about');
		speak('en');
		expect(withLanguage('/about')).toBe('/about?lang=en');
		expect(withLanguage('/?cell=1_2')).toBe('/?cell=1_2&lang=en');
	});
});
