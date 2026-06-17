import { defineConfig } from 'vitest/config';

// Standalone config (no sveltekit plugin): the unit tests cover pure TS utilities
// — proj4 reprojection, cell-geometry maths, density — so they need no DOM or
// SvelteKit runtime. Add a jsdom environment + the svelte plugin here if/when
// component tests are introduced.
export default defineConfig({
	test: {
		environment: 'node',
		include: ['src/**/*.test.ts']
	}
});
