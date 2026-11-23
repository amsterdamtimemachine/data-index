import { goto } from '$app/navigation';

/**
 * Navigate to the current URL with its query params changed, so the loader reruns.
 * The page stays where it is: focus and scroll are kept, since the control that
 * changed a filter is the one the user is on.
 */
export function navigateParams(mutate: (params: URLSearchParams) => void) {
	const url = new URL(window.location.href);
	mutate(url.searchParams);
	goto(url.pathname + url.search, { reset: false });
}

/** Drops the place selection from the params. */
export function withoutPlace(params: URLSearchParams) {
	params.delete('place');
	params.delete('name');
}
