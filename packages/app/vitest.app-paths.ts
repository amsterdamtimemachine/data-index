/**
 * Stand-in for SvelteKit's $app/paths under vitest, which runs without the Kit
 * plugin: the app is served at the root. A test can still vi.mock('$app/paths').
 */
export const base = '';

export function resolve(path: string): string {
	return path;
}

export function asset(path: string): string {
	return path;
}
