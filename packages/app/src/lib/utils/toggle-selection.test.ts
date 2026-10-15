import { describe, test, expect } from 'vitest';
import { toggleSelection } from './toggle-selection';

describe('toggleSelection', () => {
	test('checkboxes add and remove', () => {
		expect(toggleSelection(['a'], 'b', 'multiple', false)).toEqual(['a', 'b']);
		expect(toggleSelection(['a', 'b'], 'a', 'multiple', false)).toEqual(['b']);
	});

	test('a required selection keeps its last item', () => {
		const current = ['a'];
		expect(toggleSelection(current, 'a', 'multiple', true)).toBe(current);
		expect(toggleSelection(['a'], 'a', 'multiple', false)).toEqual([]);
	});

	test('radios replace, and press off unless one is required', () => {
		expect(toggleSelection(['a'], 'b', 'single', false)).toEqual(['b']);
		expect(toggleSelection(['a'], 'a', 'single', false)).toEqual([]);
		const current = ['a'];
		expect(toggleSelection(current, 'a', 'single', true)).toBe(current);
	});
});
