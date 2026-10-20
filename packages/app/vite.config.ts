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
	server: {
		fs: {
			allow: ['tailwind.config.js']
		}
	}
});
