/**
 * GET a JSON resource, routing the result through callbacks, with cancellation.
 *
 * Meant to be returned from a Svelte $effect: the effect re-runs (filters changed)
 * call the returned cleanup, aborting the in-flight request so the server stops
 * streaming a response no one is waiting for. An abort rejects with AbortError, so
 * onData never fires on a stale response and onError skips it (a real HTTP failure
 * still falls through). onSettled runs on every settle — abort included — so a
 * start/stop loading counter stays balanced.
 */
export function fetchJson<T>(
	path: string,
	onData: (data: T) => void,
	onError: () => void,
	onSettled?: () => void
): () => void {
	const controller = new AbortController();

	fetch(path, { signal: controller.signal })
		.then((r) => (r.ok ? (r.json() as Promise<T>) : Promise.reject(r)))
		.then((res) => onData(res))
		.catch((err) => {
			if ((err as { name?: string })?.name !== 'AbortError') onError();
		})
		.finally(() => onSettled?.());

	return () => controller.abort();
}
