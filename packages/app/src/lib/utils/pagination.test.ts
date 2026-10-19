import { describe, test, expect } from 'vitest';
import { pageStrip, clampPage, totalPages } from './pagination';

const shown = (current: number, total: number) =>
	pageStrip(current, total).map((item) => {
		if (item.kind === 'gap') {
			return '…';
		}
		return item.value;
	});

describe('pageStrip', () => {
	test('the current page, its successor, a gap and the last', () => {
		expect(shown(1, 10)).toEqual([1, 2, '…', 10]);
		expect(shown(5, 10)).toEqual([5, 6, '…', 10]);
	});

	test('no gap when the successor is next to the last', () => {
		expect(shown(8, 10)).toEqual([8, 9, 10]);
		expect(shown(9, 10)).toEqual([9, 10]);
	});

	test('on the last page the mirror: first, gap, predecessor, last', () => {
		expect(shown(10, 10)).toEqual([1, '…', 9, 10]);
		expect(shown(3, 3)).toEqual([1, 2, 3]);
		expect(shown(2, 2)).toEqual([1, 2]);
	});

	test('a single page is just itself', () => {
		expect(shown(1, 1)).toEqual([1]);
	});
});

describe('page arithmetic', () => {
	test('total pages rounds up and is never zero', () => {
		expect(totalPages(101, 25)).toBe(5);
		expect(totalPages(0, 25)).toBe(1);
	});

	test('a page is clamped to the range', () => {
		expect(clampPage(0, 5)).toBe(1);
		expect(clampPage(9, 5)).toBe(5);
		expect(clampPage(3, 5)).toBe(3);
	});
});
