// below Tailwind's md breakpoint — where the features panel goes fullscreen
export const MOBILE_MAX_WIDTH = 767;
export const MOBILE_QUERY = `(max-width: ${MOBILE_MAX_WIDTH}px)`;

/**
 * Reactive media query. Call during component initialisation; `.matches` tracks
 * the environment (resize, rotation) and the listener is cleaned up with the
 * component. SSR renders as false until hydration.
 */
export function createMediaQuery(query: string): { readonly matches: boolean } {
	let matches = $state(false);

	$effect(() => {
		const mql = window.matchMedia(query);
		matches = mql.matches;
		const onChange = (e: MediaQueryListEvent) => {
			matches = e.matches;
		};
		mql.addEventListener('change', onChange);
		return () => mql.removeEventListener('change', onChange);
	});

	return {
		get matches() {
			return matches;
		}
	};
}
