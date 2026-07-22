/**
 * GET a JSON resource, routing the result through callbacks, with cancellation.
 *
 * Meant to be returned from a Svelte $effect: the effect re-runs (filters changed)
 * call the returned cleanup, marking the in-flight request stale so a late response
 * can't overwrite fresher state. onSettled runs even when cancelled, so a start/stop
 * loading counter stays balanced.
 */
export function fetchJson<T>(
	path: string,
	onData: (data: T) => void,
	onError: () => void,
	onSettled?: () => void
): () => void {
	let cancelled = false;

	fetch(path)
		.then((r) => (r.ok ? (r.json() as Promise<T>) : Promise.reject(r)))
		.then((res) => {
			if (!cancelled) onData(res);
		})
		.catch(() => {
			if (!cancelled) onError();
		})
		.finally(() => onSettled?.());

	return () => {
		cancelled = true;
	};
}
