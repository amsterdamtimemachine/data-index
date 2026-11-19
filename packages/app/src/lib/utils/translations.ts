/**
 * The UI's strings in the page's language. Dutch is the default; `lang=en` in the URL
 * asks for English. The language is fixed for a page's lifetime: the switch reloads the
 * page, so nothing here is reactive. In the browser it is read once from the address;
 * on the server each request supplies its own (see hooks.server.ts). Source data
 * (titles, descriptions, place and dataset names) is never translated.
 */
import { NL } from './translations/nl';
import { EN } from './translations/en';

export const LANGUAGES = ['nl', 'en'] as const;
export type Language = (typeof LANGUAGES)[number];
export const DEFAULT_LANGUAGE: Language = 'nl';
export const LANGUAGE_PARAM = 'lang';

const MAPS: Record<Language, Record<string, string>> = { nl: NL, en: EN };

/** The language a `lang` value asks for; anything unknown or absent is the default. */
export function parseLanguage(value: string | null | undefined): Language {
	if (value === 'en') {
		return 'en';
	}
	return DEFAULT_LANGUAGE;
}

function addressLanguage(): Language {
	if (typeof window === 'undefined' || !window.location) {
		return DEFAULT_LANGUAGE;
	}
	return parseLanguage(new URLSearchParams(window.location.search).get(LANGUAGE_PARAM));
}

const pageLanguage = addressLanguage();
let languageSource: () => Language = () => pageLanguage;

/** Replace where the language comes from: the server reads it per request. */
export function setLanguageSource(source: () => Language) {
	languageSource = source;
}

export function currentLanguage(): Language {
	return languageSource();
}

/** An internal link that keeps the page's language: the default language adds nothing. */
export function withLanguage(href: string): string {
	const language = currentLanguage();
	if (language === DEFAULT_LANGUAGE) {
		return href;
	}
	const joiner = href.includes('?') ? '&' : '?';
	return `${href}${joiner}${LANGUAGE_PARAM}=${language}`;
}

/** A key's string in the page's language. Returns the key itself if no translation exists. */
export function translate(key: string): string {
	return MAPS[currentLanguage()][key] || key;
}

export function translateAll(keys: string[]): string[] {
	return keys.map(translate);
}

/** Whether a key has a translation of its own. */
export function hasTranslation(key: string): boolean {
	return key in NL;
}

/** A translated template with its {name} slots filled in: fill('(nu {name})', { name: 'Dam' }). */
export function fill(template: string, values: Record<string, string> = {}): string {
	return template.replace(/\{(\w+)\}/g, (slot, name: string) => {
		if (name in values) {
			return values[name];
		}
		return slot;
	});
}
