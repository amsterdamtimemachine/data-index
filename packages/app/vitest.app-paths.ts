/**
 * Stand-in for SvelteKit's $app/paths under vitest, which runs without the Kit
 * plugin: the app is served at the root. A test can still vi.mock('$app/paths').
 */

// a route ID starts with a slash, a pathname does not
export function resolve(path: string): string {
	if (path.startsWith('/')) {
		return path;
	}
	return `/${path}`;
}

export function asset(file: string): string {
	return `/${file}`;
}
