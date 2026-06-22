import type { AppError, AppErrorType, PageErrorData } from '$types/error';
import { translate, translateErrorMessage } from './translations';

let errorIdCounter = 0;

export function createError(
	type: AppErrorType,
	title: string,
	description: string,
	context?: Record<string, any>
): AppError {
	return {
		id: `error_${++errorIdCounter}_${Date.now()}`,
		type,
		title: translate(title),
		description: translateErrorMessage(description),
		timestamp: new Date(),
		context
	};
}

export function createPageErrorData(errors: AppError[] = []): PageErrorData {
	return {
		errors,
		hasErrors: errors.length > 0
	};
}

// Helper functions for common error scenarios
export function createPeriodNotFoundError(
	requestedPeriod: string,
	availablePeriods: string[],
	fallbackPeriod: string
): AppError {
	return createError(
		'warning',
		'Period Not Found',
		`Periode "${requestedPeriod}" doesn't exist in the dataset. Defaulting to most recent period (${fallbackPeriod}).`,
		{
			requestedPeriod,
			fallbackPeriod,
			totalAvailablePeriods: availablePeriods.length
		}
	);
}

export function createCellNotFoundError(cellId: string, period: string): AppError {
	return createError(
		'warning',
		'Cell Not Found',
		`Cell "${cellId}" doesn't exist for period "${period}".`,
		{ cellId, period }
	);
}

export function createCellLoadError(cellId: string, period: string, reason?: string): AppError {
	return createError(
		'error',
		'Failed to Load Cell Data',
		reason
			? `Could not load data for cell "${cellId}": ${reason}`
			: `Could not load data for cell "${cellId}". Please try again.`,
		{ cellId, period, reason }
	);
}

export function createEmptyCellError(cellId: string, period: string): AppError {
	return createError(
		'info',
		'Empty Cell',
		`Cell "${cellId}" has no content for period "${period}".`,
		{ cellId, period }
	);
}

export function createValidationError(field: string, value: any, reason: string): AppError {
	return createError('warning', 'Invalid Input', `${field} "${value}" is invalid: ${reason}`, {
		field,
		value,
		reason
	});
}
