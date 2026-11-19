import { describe, test, expect } from 'vitest';
import { toggleSelection } from './toggle-selection';

describe('toggleSelection', () => {
	test('checkboxes add and remove', () => {
		expect(toggleSelection(['a'], 'b', false)).toEqual(['a', 'b']);
		expect(toggleSelection(['a', 'b'], 'a', false)).toEqual(['b']);
	});

	test('a required selection keeps its last item', () => {
		const current = ['a'];
		expect(toggleSelection(current, 'a', true)).toBe(current);
		expect(toggleSelection(['a'], 'a', false)).toEqual([]);
	});
});
