// Deploying to a non-Bun host? `bun add -d @sveltejs/adapter-auto` and swap the import below.
import adapter from "svelte-adapter-bun";
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import { preprocessMeltUI, sequence } from '@melt-ui/pp';
import { mdsvex } from 'mdsvex';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	extensions: ['.svelte', '.svx'],
	preprocess: sequence([
		vitePreprocess({
			script: true // Make sure this is enabled for TypeScript
		}),
		mdsvex({ extensions: ['.svx'] }),
		preprocessMeltUI()
	]),

	kit: {
		adapter: adapter(),
		alias: {
			$routes: 'src/routes',
			$components: 'src/lib/components',
			$state: 'src/lib/state',
			$types: 'src/lib/types',
			$utils: 'src/lib/utils/',
			$constants: 'src/lib/constants.ts',
			$stores: 'src/lib/stores',
			$tailwindConfig: 'tailwind.config.js',
			$content: 'static/content',
		}
	}
};

export default config;
