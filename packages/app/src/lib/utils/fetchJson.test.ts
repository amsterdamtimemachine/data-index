import { describe, test, expect } from 'vitest';
import { classifyFailure, describeFailure } from './fetchJson';

describe('classifyFailure', () => {
	test('no answer at all, or the proxy saying the server is down: unreachable', () => {
		expect(classifyFailure(new TypeError('Failed to fetch'))).toBe('unreachable');
		expect(classifyFailure(new Response(null, { status: 502 }))).toBe('unreachable');
		expect(classifyFailure(new Response(null, { status: 503 }))).toBe('unreachable');
	});

	test('the server answered with an error: server', () => {
		expect(classifyFailure(new Response(null, { status: 500 }))).toBe('server');
		expect(classifyFailure(new Response(null, { status: 404 }))).toBe('server');
		expect(classifyFailure(new SyntaxError('Unexpected token'))).toBe('server');
	});

	test('a request cancelled on purpose: aborted', () => {
		expect(classifyFailure(new DOMException('aborted', 'AbortError'))).toBe('aborted');
	});
});

describe('describeFailure', () => {
	test('the kind, and the status when the server answered', () => {
		expect(describeFailure(new Response(null, { status: 500 }))).toEqual({ kind: 'server', status: 500 });
		expect(describeFailure(new TypeError('Failed to fetch'))).toEqual({ kind: 'unreachable', status: null });
	});
});
