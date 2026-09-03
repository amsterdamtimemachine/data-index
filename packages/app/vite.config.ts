import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig, defaultClientConditions, defaultServerConditions } from 'vite';

export default defineConfig({
	plugins: [sveltekit()],
	envDir: '../../',
	// maplibre-gl v6 is ESM-only and loads its worker as a sub-path (maplibre-gl-worker.mjs)
	// that Vite's dep optimizer mishandles. Serve it unbundled in dev instead.
	optimizeDeps: {
		exclude: ['maplibre-gl']
	},
	server: {
		fs: {
			allow: ['tailwind.config.js']
		}
	},
	// Vite 6 resolves each environment with its own conditions and the svelte plugin's
	// `svelte` condition does not land in either here: without it the SSR build cannot
	// resolve svelte-only exports (phosphor-svelte's lib/*) and the client fails to hydrate.
	resolve: {
		conditions: ['svelte', ...defaultClientConditions]
	},
	ssr: {
		resolve: {
			conditions: ['svelte', ...defaultServerConditions]
		}
	}
});
