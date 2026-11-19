import { describe, test, expect, vi } from 'vitest';
import { ToggleGroup } from './toggle-group';

function group(selected: string[], requireOne = false) {
	const onChange = vi.fn();
	const g = new ToggleGroup({ selected: () => selected, onChange, requireOne: () => requireOne, labelledBy: () => 'h1' });
	return { g, onChange };
}

describe('ToggleGroup builder', () => {
	test('a labelled group of checkboxes whose checked state follows the selection', () => {
		const { g } = group(['a']);
		expect(g.root).toEqual({ role: 'group', 'aria-labelledby': 'h1' });
		expect(g.item('a')).toMatchObject({ role: 'checkbox', 'aria-checked': true, 'data-state': 'on' });
		expect(g.item('b')).toMatchObject({ role: 'checkbox', 'aria-checked': false, 'data-state': 'off' });
		expect(g.item('c', true)).toMatchObject({ disabled: true, 'data-disabled': '' });
	});

	test('a press reports the next selection, and nothing when it would empty a required group', () => {
		const { g, onChange } = group(['a'], true);
		g.item('b').onclick();
		expect(onChange).toHaveBeenCalledWith(['a', 'b']);
		onChange.mockClear();
		g.item('a').onclick();
		expect(onChange).not.toHaveBeenCalled();
	});
});
