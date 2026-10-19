import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';

const toasts: Array<{ title: string; description?: string; failure?: boolean }> = [];
vi.mock('$state/toaster.svelte', () => ({
	addToast: ({ data }: { data: { title: string; description?: string; failure?: boolean } }) => toasts.push(data)
}));

import { notifyOnce, notifyFailure, message, linkMessage } from './notify';

describe('notify', () => {
	// the repeat window outlives a test, so each test starts an hour after the last
	let clock = 0;
	beforeEach(() => {
		clock += 3_600_000;
		vi.useFakeTimers();
		vi.setSystemTime(clock);
		vi.spyOn(console, 'warn').mockImplementation(() => {});
		toasts.length = 0;
	});
	afterEach(() => {
		vi.useRealTimers();
	});

	// failures are gathered for half a second before one toast shows
	function settle() {
		vi.advanceTimersByTime(500);
	}

	test('no answer at all: one toast that the index is unreachable, without a code', () => {
		const lost = new TypeError('Failed to fetch');
		notifyFailure('mapNotLoaded', lost);
		notifyFailure('timelineNotLoaded', lost);
		notifyFailure('placeSearchFailed', lost);
		expect(toasts).toHaveLength(0);
		settle();
		expect(toasts).toEqual([{ title: 'Index niet bereikbaar', description: undefined, failure: true }]);
	});

	test('one feature failing on its own keeps its message, with the code', () => {
		notifyFailure('mapNotLoaded', new Response(null, { status: 500 }));
		settle();
		expect(toasts).toEqual([{ title: 'Kaart niet geladen', description: 'Foutcode 500', failure: true }]);
	});

	test('several features failing together are one cause: the index, with the code', () => {
		notifyFailure('mapNotLoaded', new Response(null, { status: 500 }));
		notifyFailure('timelineNotLoaded', new Response(null, { status: 500 }));
		notifyFailure('featuresNotLoaded', new Response(null, { status: 500 }));
		notifyFailure('topicCountsNotLoaded', new Response(null, { status: 500 }));
		settle();
		expect(toasts).toEqual([{ title: 'Index niet bereikbaar', description: 'Foutcode 500', failure: true }]);
	});

	test('the proxy saying the server is down: unreachable, with its code', () => {
		notifyFailure('featuresNotLoaded', new Response(null, { status: 503 }));
		settle();
		expect(toasts).toEqual([{ title: 'Index niet bereikbaar', description: 'Foutcode 503', failure: true }]);
	});

	test('a sentence of its own and the code are both shown', () => {
		notifyFailure('topicCountsNotLoaded', new Response(null, { status: 500 }));
		settle();
		expect(toasts[0].description).toBe('De onderwerpen werken nog wel.\nFoutcode 500');
	});

	test('offline, whatever failed: no internet connection', () => {
		vi.stubGlobal('navigator', { onLine: false });
		notifyFailure('mapNotLoaded', new TypeError('Failed to fetch'));
		notifyFailure('featuresNotLoaded', new TypeError('Failed to fetch'));
		settle();
		vi.unstubAllGlobals();
		expect(toasts).toEqual([{ title: 'Geen internetverbinding', description: undefined, failure: true }]);
	});

	test('a cancelled request says nothing; a failure a loader described is shown like the others', () => {
		notifyFailure('mapNotLoaded', new DOMException('aborted', 'AbortError'));
		settle();
		expect(toasts).toHaveLength(0);
		notifyFailure('indexNotLoaded', { kind: 'server', status: 500 });
		settle();
		expect(toasts).toEqual([{ title: 'Index niet geladen', description: 'Foutcode 500', failure: true }]);
	});

	test('the repeat window goes by the message: a 502 and then a 503 are one outage', () => {
		notifyFailure('mapNotLoaded', new Response(null, { status: 502 }));
		settle();
		notifyFailure('featuresNotLoaded', new Response(null, { status: 503 }));
		settle();
		expect(toasts).toHaveLength(1);
		vi.advanceTimersByTime(10_000);
		notifyFailure('featuresNotLoaded', new Response(null, { status: 503 }));
		settle();
		expect(toasts).toHaveLength(2);
	});

	test('only failures are marked as such; other toasts are plain', () => {
		notifyOnce({ title: 'Iets anders' });
		notifyFailure('mapNotLoaded', new Response(null, { status: 500 }));
		settle();
		expect(toasts.map((t) => t.failure)).toEqual([false, true]);
	});

	test('a once-per-visit toast is never repeated', () => {
		notifyOnce({ title: 'Onbekende waarde in de link', text: '‘nope’ bestaat niet en wordt genegeerd.' });
		vi.advanceTimersByTime(60_000);
		notifyOnce({ title: 'Onbekende waarde in de link', text: '‘nope’ bestaat niet en wordt genegeerd.' });
		expect(toasts).toHaveLength(1);
	});
});

describe('message', () => {
	test('a title, with its sentence when it has one', () => {
		expect(message('mapNotLoaded')).toEqual({ title: 'Kaart niet geladen' });
		expect(message('topicCountsNotLoaded')).toEqual({ title: 'Aantallen per onderwerp niet geladen', text: 'De onderwerpen werken nog wel.' });
	});
});

describe('linkMessage', () => {
	test('nothing wrong, no toast', () => {
		expect(linkMessage([], null)).toBeNull();
	});

	test('one unknown value', () => {
		expect(linkMessage(['nope'], null)).toEqual({ title: 'Onbekende waarde in de link', text: '‘nope’ bestaat niet en wordt genegeerd.' });
	});

	test('several unknown values in one list, each once', () => {
		expect(linkMessage(['nope', 'video', 'nope'], null)).toEqual({
			title: 'Onbekende waarden in de link',
			text: '‘nope’, ‘video’ bestaan niet en worden genegeerd.'
		});
	});

	test('a replaced period alone, and together with unknown values in the same toast', () => {
		expect(linkMessage([], '1925_1950')).toEqual({
			title: 'Onbekende waarde in de link',
			text: 'Periode 1925–1950 bestaat niet; de meest recente periode wordt getoond.'
		});
		expect(linkMessage(['nope'], 'abc')).toEqual({
			title: 'Onbekende waarden in de link',
			text: '‘nope’ bestaat niet en wordt genegeerd.\nPeriode ‘abc’ bestaat niet; de meest recente periode wordt getoond.'
		});
	});
});
