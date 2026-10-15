import { describe, test, expect, vi } from 'vitest';
import { ToggleGroup } from './toggle-group';

function group(selected: string[], type: 'single' | 'multiple', requireOne = false) {
	const onChange = vi.fn();
	const g = new ToggleGroup({ selected: () => selected, onChange, type: () => type, requireOne: () => requireOne, labelledBy: () => 'h1' });
	return { g, onChange };
}

describe('ToggleGroup builder', () => {
	test('checkboxes: every enabled item is a tab stop, checked state follows the selection', () => {
		const { g } = group(['a'], 'multiple');
		expect(g.root).toMatchObject({ role: 'group', 'aria-labelledby': 'h1' });
		expect(g.item('a')).toMatchObject({ role: 'checkbox', 'aria-checked': true, 'data-state': 'on', tabindex: 0 });
		expect(g.item('b')).toMatchObject({ role: 'checkbox', 'aria-checked': false, 'data-state': 'off', tabindex: 0 });
		expect(g.item('c', true)).toMatchObject({ disabled: true, 'data-disabled': '' });
	});

	test('radios: only the checked one is a tab stop; all are when nothing is checked', () => {
		expect(group(['a'], 'single').g.item('a').tabindex).toBe(0);
		expect(group(['a'], 'single').g.item('b').tabindex).toBe(-1);
		expect(group([], 'single').g.item('b').tabindex).toBe(0);
		expect(group([], 'single').g.root.role).toBe('radiogroup');
	});

	test('a press reports the next selection, and nothing when it would empty a required group', () => {
		const { g, onChange } = group(['a'], 'multiple', true);
		g.item('b').onclick();
		expect(onChange).toHaveBeenCalledWith(['a', 'b']);
		onChange.mockClear();
		g.item('a').onclick();
		expect(onChange).not.toHaveBeenCalled();
	});
});
