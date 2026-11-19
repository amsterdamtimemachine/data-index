import { describe, test, expect } from 'vitest';
import type { HistogramBin } from '@atm/shared/types';
import { selectionCountFor } from './histogram';

function bin(key: string, count: number): HistogramBin {
	return { count, timeSlice: { key, label: key, startYear: 0, endYear: 0 } } as HistogramBin;
}

describe('selectionCountFor', () => {
	test('the selection\'s count for the slice, or null where it has nothing', () => {
		const bins = [bin('1900_1949', 3), bin('1950_1999', 0)];
		expect(selectionCountFor(bins, '1900_1949')).toBe(3);
		expect(selectionCountFor(bins, '1950_1999')).toBeNull();
		expect(selectionCountFor(bins, '2000_2049')).toBeNull();
		expect(selectionCountFor([], '1900_1949')).toBeNull();
	});
});
