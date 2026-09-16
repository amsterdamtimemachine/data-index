import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { fileURLToPath } from 'url';

const src = fileURLToPath(new URL('./src', import.meta.url));

// Standalone config (no sveltekit plugin). The unit tests cover pure TS utilities
// and the runes-based state modules (*.svelte.ts), which the svelte plugin compiles;
// the browser condition gives them Svelte's client runtime. No DOM: component
// tests would still need a jsdom environment here.
export default defineConfig({
	plugins: [svelte()],
	resolve: {
		conditions: ['browser'],
		alias: {
			$lib: `${src}/lib`,
			$components: `${src}/lib/components`,
			$state: `${src}/lib/state`,
			$types: `${src}/lib/types`,
			$utils: `${src}/lib/utils`
		}
	},
	test: {
		environment: 'node',
		include: ['src/**/*.test.ts']
	}
});
