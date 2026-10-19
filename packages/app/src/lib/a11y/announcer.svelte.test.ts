import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { announcer } from './announcer.svelte';

describe('announcer', () => {
	beforeEach(() => vi.useFakeTimers());
	afterEach(() => vi.useRealTimers());

	test('a message is set after a short wait', () => {
		announcer.announce('26 features van deze cel');
		expect(announcer.message).not.toBe('26 features van deze cel');
		vi.advanceTimersByTime(500);
		expect(announcer.message).toBe('26 features van deze cel');
	});

	test('calls close together collapse into the last one', () => {
		announcer.announce('Pagina 2 van 9, 900 features van deze cel');
		vi.advanceTimersByTime(200);
		announcer.announce('Pagina 3 van 9, 900 features van deze cel');
		vi.advanceTimersByTime(499);
		expect(announcer.message).not.toBe('Pagina 2 van 9, 900 features van deze cel');
		vi.advanceTimersByTime(1);
		expect(announcer.message).toBe('Pagina 3 van 9, 900 features van deze cel');
	});
});
