import type { ClassValue } from 'clsx';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import type { HeatmapDimensions } from '@atm/shared/types';

export function mergeCss(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs));
}

/** Whether a cell id ("row_col") is well formed and inside the grid. */
export function isValidCellId(cellId: string, dimensions: HeatmapDimensions): boolean {
	if (!/^\d+_\d+$/.test(cellId)) {
		return false;
	}
	const [row, col] = cellId.split('_').map((part) => parseInt(part, 10));
	return row >= 0 && row < dimensions.rowsAmount && col >= 0 && col < dimensions.colsAmount;
}
