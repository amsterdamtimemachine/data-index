import type { ClassValue } from 'clsx';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import type { HeatmapDimensions } from '@atm/shared/types';

export function mergeCss(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs));
}

/**
 * Validates if a cell ID is properly formatted and within grid bounds
 * Since the grid is deterministic, we only need dimensions to validate
 */
export function validateCellId(
	cellId: string,
	dimensions: HeatmapDimensions
): { isValid: boolean; error?: string } {
	// Check basic format (row_col pattern)
	const cellPattern = /^\d+_\d+$/;
	if (!cellPattern.test(cellId)) {
		return {
			isValid: false,
			error: `Invalid cell format. Expected "row_col" format, got "${cellId}"`
		};
	}

	const [rowStr, colStr] = cellId.split('_');
	const row = parseInt(rowStr, 10);
	const col = parseInt(colStr, 10);

	// Check if coordinates are within grid bounds
	if (row < 0 || row >= dimensions.rowsAmount || col < 0 || col >= dimensions.colsAmount) {
		return {
			isValid: false,
			error: `Cell "${cellId}" is outside grid bounds (${dimensions.rowsAmount}x${dimensions.colsAmount})`
		};
	}

	return { isValid: true };
}
