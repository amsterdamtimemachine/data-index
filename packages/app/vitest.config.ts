import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { fileURLToPath } from 'url';

// Standalone config (no sveltekit plugin). The unit tests cover pure TS utilities
// and the runes-based state modules (*.svelte.ts), which the svelte plugin compiles;
// the browser condition and the client-side environment (see vitest.environment.ts)
// give them Svelte's client runtime, effects included. No DOM: component tests
// would still need a jsdom environment here.
export default defineConfig({
	plugins: [svelte()],
	resolve: {
		conditions: ['browser'],
		alias: {
			'$app/paths': fileURLToPath(new URL('./vitest.app-paths.ts', import.meta.url))
		}
	},
	test: {
		environment: './vitest.environment.ts',
		include: ['src/**/*.test.ts']
	}
});
