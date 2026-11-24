/**
 * The page's language, per request: `lang` in the URL decides, and every translate()
 * during that request's render reads it. The html shell declares it and carries the
 * description for search engines and link previews in it.
 */
import { AsyncLocalStorage } from 'node:async_hooks';
import type { Handle } from '@sveltejs/kit/hooks';
import {
	DEFAULT_LANGUAGE,
	LANGUAGE_PARAM,
	parseLanguage,
	setLanguageSource,
	translate,
	type Language
} from '#lib/utils/translations.js';

const LOCALES: Record<Language, string> = { nl: 'nl_NL', en: 'en_GB' };

const requestLanguage = new AsyncLocalStorage<Language>();
setLanguageSource(() => requestLanguage.getStore() ?? DEFAULT_LANGUAGE);

export const handle: Handle = ({ event, resolve }) => {
	const language = parseLanguage(event.url.searchParams.get(LANGUAGE_PARAM));
	return requestLanguage.run(language, () => {
		const description = translate('metaDescription');
		return resolve(event, {
			transformPageChunk: ({ html }) =>
				html
					.replace('%lang%', language)
					.replace('%locale%', LOCALES[language])
					.replaceAll('%description%', description)
		});
	});
};
