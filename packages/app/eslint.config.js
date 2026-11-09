import js from '@eslint/js';
import ts from 'typescript-eslint';
import svelte from 'eslint-plugin-svelte';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

/** @type {import('eslint').Linter.Config[]} */
export default [
	js.configs.recommended,
	...ts.configs.recommended,
	...svelte.configs['flat/recommended'],
	prettier,
	...svelte.configs['flat/prettier'],
	{
		languageOptions: {
			globals: {
				...globals.browser,
				...globals.node
			}
		}
	},
	{
		files: ['**/*.svelte', '**/*.svelte.ts', '**/*.svelte.js'],
		languageOptions: {
			parserOptions: {
				parser: ts.parser
			}
		}
	},
	{
		rules: {
			// internal links and API URLs are guarded by the no-restricted-syntax rules below;
			// a dynamic href is an external URL, and a goto() carries a path taken from the
			// current location, base path included
			'svelte/no-navigation-without-resolve': ['error', { ignoreLinks: true, ignoreGoto: true }],
			// a Map or URLSearchParams built inside a $derived is a value, not state
			'svelte/prefer-svelte-reactivity': 'off'
		}
	},
	{
		files: ['**/*.svelte'],
		rules: {
			// TypeScript checks identifiers; no-undef cannot see Svelte generics
			'no-undef': 'off'
		}
	},
	{
		// absolute app URLs go through apiUrl / resolve / asset so a base path applies
		files: ['src/**/*.ts', 'src/**/*.svelte'],
		ignores: ['src/lib/utils/api.ts', 'src/**/*.test.ts'],
		rules: {
			'no-restricted-syntax': [
				'error',
				{
					// esquery ends a regex at the first `/`, hence \u002f
					selector: 'Literal[value=/^\\u002fapi\\u002f/]:not(CallExpression[callee.name="apiUrl"] > Literal)',
					message: 'Build API URLs with apiUrl() from #lib/utils/api.js so the base path applies.'
				},
				{
					selector: 'TemplateElement[value.raw=/^\\u002fapi\\u002f/]',
					message: 'Build API URLs with apiUrl() from #lib/utils/api.js so the base path applies.'
				},
				{
					selector: 'SvelteAttribute[key.name="href"] > SvelteLiteral[value=/^\\u002f/]',
					message: 'Use resolve() from $app/paths for internal links so the base path applies.'
				},
				{
					selector: 'SvelteAttribute[key.name="src"] > SvelteLiteral[value=/^\\u002f/]',
					message: 'Use asset() from $app/paths for static files so the base path applies.'
				},
				{
					selector: 'Literal[value=/^\\u002flogos\\u002f/]:not(CallExpression[callee.name="asset"] > Literal)',
					message: 'Use asset() from $app/paths for static files so the base path applies.'
				}
			]
		}
	},
	{
		ignores: ['build/', '.svelte-kit/', 'dist/']
	}
];
