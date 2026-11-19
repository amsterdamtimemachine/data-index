/**
 * The page's language, per request: `lang` in the URL decides, and every translate()
 * during that request's render reads it. The html element declares it.
 */
import { AsyncLocalStorage } from 'node:async_hooks';
import type { Handle } from '@sveltejs/kit/hooks';
import {
	DEFAULT_LANGUAGE,
	LANGUAGE_PARAM,
	parseLanguage,
	setLanguageSource,
	type Language
} from '#lib/utils/translations.js';

const requestLanguage = new AsyncLocalStorage<Language>();
setLanguageSource(() => requestLanguage.getStore() ?? DEFAULT_LANGUAGE);

export const handle: Handle = ({ event, resolve }) => {
	const language = parseLanguage(event.url.searchParams.get(LANGUAGE_PARAM));
	return requestLanguage.run(language, () =>
		resolve(event, { transformPageChunk: ({ html }) => html.replace('%lang%', language) })
	);
};
