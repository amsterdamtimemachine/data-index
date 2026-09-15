// Deploying to a non-Bun host? `bun add -d @sveltejs/adapter-auto` and swap the import below.
import adapter from "svelte-adapter-bun";
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import { preprocessMeltUI, sequence } from '@melt-ui/pp';
import { mdsvex } from 'mdsvex';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const root = dirname(fileURLToPath(import.meta.url));

// Path prefix the app is served under, baked in at build time (BASE_PATH=/experimental
// builds an image that lives at /experimental). Empty serves at the root.
const base = (process.env.BASE_PATH ?? '').replace(/\/+$/, '');

/** @type {import('@sveltejs/kit').Config} */
const config = {
	extensions: ['.svelte', '.svx'],
	preprocess: sequence([
		vitePreprocess({
			script: true // Make sure this is enabled for TypeScript
		}),
		mdsvex({ extensions: ['.svx'], layout: join(root, 'src/lib/components/markdown/MdsvexLayout.svelte') }),
		preprocessMeltUI()
	]),

	kit: {
		adapter: adapter(),
		paths: { base },
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
