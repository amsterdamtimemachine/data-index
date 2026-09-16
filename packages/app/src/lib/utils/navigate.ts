import { goto } from '$app/navigation';

/** Navigate to the current URL with its query params changed, so the loader reruns. */
export function navigateParams(mutate: (params: URLSearchParams) => void) {
	const url = new URL(window.location.href);
	mutate(url.searchParams);
	goto(url.pathname + url.search);
}

/** Drops the place selection from the params. */
export function withoutPlace(params: URLSearchParams) {
	params.delete('place');
	params.delete('name');
}
