/**
 * API URLs, prefixed with the app's base path. The only place an `/api/…` string
 * may be written: every fetch, loader and preload builds its URL here, so a build
 * served under a prefix (see BASE_PATH in vite.config.ts) reaches its own API.
 * Links use resolve() and static files asset() from $app/paths for the same reason.
 */
import { resolve } from '$app/paths';
import type { RouteId } from '$app/types';

type ApiPath = Extract<RouteId, `/api/${string}`>;

export function apiUrl(path: ApiPath, params?: URLSearchParams): string {
	if (params === undefined || params.size === 0) {
		return resolve(path);
	}
	return `${resolve(path)}?${params}`;
}
