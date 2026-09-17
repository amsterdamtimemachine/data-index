/**
 * A node test environment on Vite's client environment: no DOM, but the Svelte
 * plugin compiles runes modules as client code, so $effect and $effect.root run.
 * Vitest's built-in `node` environment uses the ssr environment, under which
 * effects are compiled away.
 */
import type { Environment } from 'vitest/environments';

const environment: Environment = {
	name: 'node-client',
	viteEnvironment: 'client',
	setup() {
		return {
			teardown() {}
		};
	}
};

export default environment;
