import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

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
	}
});
