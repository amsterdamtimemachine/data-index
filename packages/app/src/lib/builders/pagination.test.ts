import { describe, test, expect, vi } from 'vitest';
import { Pagination } from './pagination';

function pagination(page: number, total: number) {
	const onChange = vi.fn();
	const p = new Pagination({ page: () => page, totalPages: () => total, onChange });
	return { p, onChange };
}

describe('Pagination builder', () => {
	test('previous and next are disabled at the ends', () => {
		expect(pagination(1, 5).p.prev.disabled).toBe(true);
		expect(pagination(1, 5).p.next.disabled).toBe(false);
		expect(pagination(5, 5).p.next.disabled).toBe(true);
		expect(pagination(1, 1).p.next.disabled).toBe(true);
	});

	test('the current page carries aria-current, the others nothing', () => {
		const { p } = pagination(3, 5);
		expect(p.page(3)).toMatchObject({ 'aria-current': 'page', 'data-selected': '' });
		expect(p.page(4)['aria-current']).toBeUndefined();
		expect(p.page(4)['data-selected']).toBeUndefined();
	});

	test('a press reports the next page; the current page reports nothing', () => {
		const { p, onChange } = pagination(3, 5);
		p.page(4).onclick();
		expect(onChange).toHaveBeenLastCalledWith(4);
		p.next.onclick();
		expect(onChange).toHaveBeenLastCalledWith(4);
		p.prev.onclick();
		expect(onChange).toHaveBeenLastCalledWith(2);
		onChange.mockClear();
		p.page(3).onclick();
		expect(onChange).not.toHaveBeenCalled();
	});

	test('a typed page is clamped to the range', () => {
		const { p, onChange } = pagination(3, 5);
		p.goTo(99);
		expect(onChange).toHaveBeenLastCalledWith(5);
		p.goTo(-2);
		expect(onChange).toHaveBeenLastCalledWith(1);
	});
});
