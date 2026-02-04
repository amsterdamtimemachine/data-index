import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import type { RecordType, FeaturesSortField, SortDirection, TagOperator } from '@atm/shared/types';
import { getFeatures } from '@atm/db';

export const GET: RequestHandler = async ({ url }) => {
	try {
		// Parse bounds (required)
		const minLon = url.searchParams.get('minLon');
		const maxLon = url.searchParams.get('maxLon');
		const minLat = url.searchParams.get('minLat');
		const maxLat = url.searchParams.get('maxLat');

		if (!minLon || !maxLon || !minLat || !maxLat) {
			throw error(400, {
				code: 'MISSING_BOUNDS',
				message: 'Missing required bounds parameters: minLon, maxLon, minLat, maxLat'
			});
		}

		const bounds = {
			minLon: parseFloat(minLon),
			maxLon: parseFloat(maxLon),
			minLat: parseFloat(minLat),
			maxLat: parseFloat(maxLat)
		};

		// Validate bounds
		if (Object.values(bounds).some(isNaN)) {
			throw error(400, {
				code: 'INVALID_BOUNDS',
				message: 'Bounds must be valid numbers'
			});
		}

		// Parse optional parameters
		const recordTypesParam = url.searchParams.get('recordTypes');
		const recordTypes = recordTypesParam
			? (recordTypesParam.split(',').map((t) => t.trim()) as RecordType[])
			: undefined;

		const tagsParam = url.searchParams.get('tags');
		const tags = tagsParam
			? tagsParam.split(',').map((t) => t.trim()).filter((t) => t.length > 0)
			: undefined;

		const tagOperator = (url.searchParams.get('tagOperator') || 'OR').toUpperCase() as TagOperator;
		const timeSlice = url.searchParams.get('timeSlice') || undefined;
		const sort = (url.searchParams.get('sort') || 'weight') as FeaturesSortField;
		const sortDirection = (url.searchParams.get('sortDirection') || 'desc') as SortDirection;
		const page = parseInt(url.searchParams.get('page') || '1', 10);
		const pageSize = Math.min(parseInt(url.searchParams.get('pageSize') || '50', 10), 200); // Cap at 200

		console.log(
			`📦 Features API request - bounds: [${bounds.minLon.toFixed(4)}, ${bounds.minLat.toFixed(4)}] to [${bounds.maxLon.toFixed(4)}, ${bounds.maxLat.toFixed(4)}], ` +
			`recordTypes: ${recordTypes?.join(', ') || 'all'}, ` +
			`tags: ${tags?.join(', ') || 'none'} (${tagOperator}), ` +
			`timeSlice: ${timeSlice || 'all'}, ` +
			`sort: ${sort} ${sortDirection}, ` +
			`page: ${page}, pageSize: ${pageSize}`
		);

		const result = await getFeatures({
			bounds,
			recordTypes,
			tags,
			tagOperator,
			timeSlice,
			sort,
			sortDirection,
			page,
			pageSize
		});

		console.log(
			`✅ Features API success - ${result.data.length} features returned (page ${result.page}/${result.totalPages}, total: ${result.total})`
		);

		const headers = {
			'Cache-Control': 'public, max-age=300', // Cache for 5 minutes
			'Access-Control-Allow-Origin': '*'
		};

		return json(result, { headers });
	} catch (err) {
		if (err && typeof err === 'object' && 'status' in err) {
			throw err; // Re-throw SvelteKit errors
		}
		console.error('❌ Features API unexpected error:', err);
		throw error(500, {
			code: 'INTERNAL_ERROR',
			message: err instanceof Error ? err.message : 'Internal server error'
		});
	}
};

// Handle preflight requests for CORS
export const OPTIONS: RequestHandler = async () => {
	return new Response(null, {
		status: 204,
		headers: {
			'Access-Control-Allow-Origin': '*',
			'Access-Control-Allow-Methods': 'GET, OPTIONS',
			'Access-Control-Allow-Headers': 'Content-Type'
		}
	});
};
