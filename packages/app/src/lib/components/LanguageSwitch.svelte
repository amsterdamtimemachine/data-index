<!--
	The language switch: one button showing the language a press leads to, EN on a Dutch
	page and NL on an English one. It is a link to this same view in that language, and
	following it reloads the page, since the language is fixed for a page's lifetime.
-->
<script lang="ts">
	import { page } from '$app/state';
	import ButtonLink from './ButtonLink.svelte';
	import {
		translate,
		currentLanguage,
		DEFAULT_LANGUAGE,
		LANGUAGE_PARAM,
		type Language
	} from '#lib/utils/translations.js';

	const NAMES: Record<Language, string> = { nl: 'languageNl', en: 'languageEn' };
	const other: Language = currentLanguage() === 'nl' ? 'en' : 'nl';

	// this view in the other language: the default language is the URL without the param
	const href = $derived.by(() => {
		const url = new URL(page.url.href);
		if (other === DEFAULT_LANGUAGE) {
			url.searchParams.delete(LANGUAGE_PARAM);
		} else {
			url.searchParams.set(LANGUAGE_PARAM, other);
		}
		return url.pathname + url.search;
	});
</script>

<ButtonLink
	{href}
	target=""
	rel=""
	class="uppercase"
	lang={other}
	hreflang={other}
	title={translate(NAMES[other])}
	aria-label={translate(NAMES[other])}
	data-sveltekit-reload
>
	{other}
</ButtonLink>
