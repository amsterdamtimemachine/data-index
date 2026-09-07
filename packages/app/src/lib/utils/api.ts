/**
 * API URLs, prefixed with the app's base path. The only place an `/api/…` string
 * may be written: every fetch, loader and preload builds its URL here, so a build
 * served under a prefix (see BASE_PATH in svelte.config.js) reaches its own API.
 * Links use resolve() and static files asset() from $app/paths for the same reason.
 */
import { base } from '$app/paths';

type ApiPath = `/api/${string}`;

export function apiUrl(path: ApiPath, params?: URLSearchParams): string {
	if (params === undefined || params.size === 0) {
		return `${base}${path}`;
	}
	return `${base}${path}?${params}`;
}
