/**
 * The one way a problem reaches the user: a toast. A failure is gathered with the ones
 * that arrive with it and not repeated within a short window, so one outage does not
 * pile up toasts; what is wrong with a link is shown once per visit. Technical detail
 * goes to the console only.
 */
import { addToast } from '$state/toaster.svelte';
import { describeFailure, type Failure } from '$utils/fetchJson';
import { translate, hasTranslation, fill } from '$utils/translations';

/** What a toast says: a title, and a sentence when the title needs one. */
export type Message = { title: string; text?: string };

/** A toast worded by its key: the title, and the sentence under <key>Text if there is one. */
export function message(key: string, values?: Record<string, string>): Message {
	const result: Message = { title: fill(translate(key), values) };
	const textKey = `${key}Text`;
	if (hasTranslation(textKey)) {
		result.text = fill(translate(textKey), values);
	}
	return result;
}

function quoted(value: string): string {
	return `‘${value}’`;
}

// a period key reads as a year range; anything else is shown as it was typed
function periodWords(period: string): string {
	const range = period.match(/^(\d{4})_(\d{4})$/);
	if (range) {
		return `${range[1]}–${range[2]}`;
	}
	return quoted(period);
}

/**
 * The one toast for what is wrong with a link: the values that do not exist and are
 * ignored, and the period that was replaced by the latest. Null when nothing is wrong.
 */
export function linkMessage(unknownValues: string[], replacedPeriod: string | null): Message | null {
	const values = [...new Set(unknownValues)];
	if (values.length === 0 && !replacedPeriod) {
		return null;
	}
	const lines: string[] = [];
	const listed = { values: values.map(quoted).join(', ') };
	if (values.length === 1) {
		lines.push(fill(translate('linkValueIgnoredOne'), listed));
	} else if (values.length > 1) {
		lines.push(fill(translate('linkValueIgnoredMany'), listed));
	}
	let count = values.length;
	if (replacedPeriod) {
		lines.push(fill(translate('linkPeriodReplaced'), { period: periodWords(replacedPeriod) }));
		count += 1;
	}
	let title = translate('linkValueUnknownMany');
	if (count === 1) {
		title = translate('linkValueUnknownOne');
	}
	return { title, text: lines.join('\n') };
}

const REPEAT_WINDOW_MS = 10_000;

const lastShown = new Map<string, number>();
const shownThisVisit = new Set<string>();

function identity(msg: Message): string {
	return `${msg.title}\n${msg.text ?? ''}`;
}

function show(msg: Message, failure = false) {
	addToast({ data: { title: msg.title, description: msg.text, failure } });
}

/** Show a toast once per visit, for what stays true while the user browses, such as a link's wrong values. */
export function notifyOnce(msg: Message) {
	const id = identity(msg);
	if (shownThisVisit.has(id)) {
		return;
	}
	shownThisVisit.add(id);
	show(msg);
}

// Failures that arrive together come from one cause: one filter change fires the map,
// the timeline, the list and the topic counts at once. They are gathered for a moment
// and shown as one toast.
const GATHER_MS = 500;
const UNREACHABLE = 'indexUnreachable';

const gathered = new Map<string, number | null>();
let gatherTimer: ReturnType<typeof setTimeout> | undefined;

function isFailure(value: unknown): value is Failure {
	return typeof value === 'object' && value !== null && 'kind' in value && 'status' in value;
}

function isOffline(): boolean {
	return typeof navigator !== 'undefined' && navigator.onLine === false;
}

// The gathered failures as one toast: a single feature's own message, or, when the
// index could not be reached or several features failed together, that the index is
// unreachable; offline, that there is no connection. A code is added when there is one.
function showGathered() {
	gatherTimer = undefined;
	const failures = [...gathered];
	gathered.clear();
	if (failures.length === 0) {
		return;
	}
	let key = UNREACHABLE;
	let status: number | null = null;
	if (failures.length === 1) {
		[key, status] = failures[0];
	} else {
		for (const [, failureStatus] of failures) {
			if (status === null) {
				status = failureStatus;
			}
		}
	}
	if (isOffline()) {
		key = 'noInternet';
		status = null;
	}
	const msg = message(key);
	if (status !== null) {
		const code = fill(translate('failureCode'), { code: String(status) });
		if (msg.text) {
			msg.text = `${msg.text}\n${code}`;
		} else {
			msg.text = code;
		}
	}
	// the repeat window goes by the message, so a 502 and then a 503 are one outage
	const id = `failure:${key}`;
	const now = Date.now();
	const last = lastShown.get(id);
	if (last !== undefined && now - last < REPEAT_WINDOW_MS) {
		return;
	}
	lastShown.set(id, now);
	show(msg, true);
}

/**
 * A failed request, by the feature's key. A cancelled one says nothing; the others are
 * gathered for a moment and shown as one red-outlined toast, so an outage or a dead
 * database is one message, not one per request. Takes what the request rejected with,
 * or a failure a loader already described.
 */
export function notifyFailure(key: string, failure: unknown) {
	let described: Failure;
	if (isFailure(failure)) {
		described = failure;
	} else {
		described = describeFailure(failure);
		console.warn(key, failure);
	}
	if (described.kind === 'aborted') {
		return;
	}
	let gatheredKey = key;
	if (described.kind === 'unreachable') {
		gatheredKey = UNREACHABLE;
	}
	if (!gathered.has(gatheredKey)) {
		gathered.set(gatheredKey, described.status);
	}
	if (gatherTimer === undefined) {
		gatherTimer = setTimeout(showGathered, GATHER_MS);
	}
}
