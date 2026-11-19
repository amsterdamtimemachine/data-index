import adapter from '@sveltejs/adapter-bun';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import { mdsvex } from 'mdsvex';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

const root = dirname(fileURLToPath(import.meta.url));

// Path prefix the app is served under, baked in at build time (BASE_PATH=/experimental
// builds an image that lives at /experimental). Empty serves at the root.
const basePath = (process.env.BASE_PATH ?? '').replace(/\/+$/, '');

function isBase(path: string): path is '' | `/${string}` {
	return path === '' || path.startsWith('/');
}

if (!isBase(basePath)) {
	throw new Error(`BASE_PATH must start with a slash, got "${basePath}"`);
}
const base = basePath;

export default defineConfig({
	plugins: [
		sveltekit({
			extensions: ['.svelte', '.svx'],
			preprocess: [
				vitePreprocess({ script: true /* Make sure this is enabled for TypeScript */ }),
				mdsvex({
					extensions: ['.svx'],
					layout: join(root, 'src/lib/components/markdown/MdsvexLayout.svelte')
				})
			],
			adapter: adapter(),
			paths: { base }
		})
	],
	envDir: '../../',
	// maplibre-gl v6 is ESM-only and loads its worker as a sub-path (maplibre-gl-worker.mjs)
	// that Vite's dep optimizer mishandles. Serve it unbundled in dev instead.
	optimizeDeps: {
		exclude: ['maplibre-gl']
	},
	// maplibre-gl in a chunk of its own, cached across deploys that change only our code
	build: {
		chunkSizeWarningLimit: 1200,
		rolldownOptions: {
			output: {
				codeSplitting: {
					groups: [{ name: 'maplibre-gl', test: /node_modules[\\/]maplibre-gl[\\/]/ }]
				}
			}
		}
	},
	// the shared package's build uses extensionless imports, which Node cannot load
	ssr: {
		noExternal: ['@atm/shared']
	},
	server: {
		fs: {
			allow: ['tailwind.config.js']
		}
	}
});
