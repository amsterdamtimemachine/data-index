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
	onError: (failure: unknown) => void,
	onSettled?: () => void
): () => void {
	const controller = new AbortController();

	fetch(path, { signal: controller.signal })
		.then((r) => (r.ok ? (r.json() as Promise<T>) : Promise.reject(r)))
		.then((res) => onData(res))
		.catch((err) => {
			if ((err as { name?: string })?.name !== 'AbortError') onError(err);
		})
		.finally(() => onSettled?.());

	return () => controller.abort();
}

/** What a failed request ended in, which decides what the user is told. */
export type FailureKind = 'aborted' | 'unreachable' | 'server';

/** A failure as loaders hand it to the page: its kind, and the status when the server answered. */
export type Failure = { kind: FailureKind; status: number | null };

// the proxy answers these when the app server behind it is down
const GATEWAY_STATUSES = [502, 503, 504];

/**
 * A request's failure, from what it rejected with: a Response with a bad status (the
 * fetchers throw it), a TypeError when fetch got no answer at all, or an AbortError
 * when it was cancelled on purpose. Anything else counts as the server's failure.
 */
export function classifyFailure(err: unknown): FailureKind {
	if (err instanceof Response) {
		if (GATEWAY_STATUSES.includes(err.status)) {
			return 'unreachable';
		}
		return 'server';
	}
	if ((err as { name?: string } | null)?.name === 'AbortError') {
		return 'aborted';
	}
	if (err instanceof TypeError) {
		return 'unreachable';
	}
	return 'server';
}

/** A request's failure with the status it came back with, if any came back. */
export function describeFailure(err: unknown): Failure {
	let status: number | null = null;
	if (err instanceof Response) {
		status = err.status;
	}
	return { kind: classifyFailure(err), status };
}
