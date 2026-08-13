import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import type { FeaturesSortField, SortDirection, TagOperator } from '@atm/shared/types';
import { DEFAULT_PAGE_SIZE, PAGE_SIZE_MAX } from '@atm/shared';
import { getFeatures } from '@atm/db';
import { parseRecordTypes, parseDatasets, parsePlaceTypes, parseList, parseBounds } from '$lib/server/query-params';

export const GET: RequestHandler = async ({ url }) => {
	try {
		// Parse bounds (required here, unlike the histogram endpoint)
		const bounds = parseBounds(url);
		if (!bounds) {
			throw error(400, {
				code: 'MISSING_BOUNDS',
				message: 'Missing required bounds parameters: minLon, maxLon, minLat, maxLat'
			});
		}

		// Parse optional parameters
		const recordTypes = parseRecordTypes(url);
		const datasetIds = parseDatasets(url);
		const placeTypes = parsePlaceTypes(url);
		const tags = parseList(url, 'tags');

		const tagOperator = (url.searchParams.get('tagOperator') || 'OR').toUpperCase() as TagOperator;
		const timeSlice = url.searchParams.get('timeSlice') || undefined;
		const sort = url.searchParams.get('sort') || 'relevance';
		const sortDirection = url.searchParams.get('sortDirection') || 'desc';

		if (!['relevance', 'spatialFrequency', 'date'].includes(sort)) {
			throw error(400, { code: 'INVALID_SORT', message: 'Invalid sort field' });
		}
		if (!['asc', 'desc'].includes(sortDirection)) {
			throw error(400, { code: 'INVALID_SORT', message: 'Invalid sort direction' });
		}

		const page = parseInt(url.searchParams.get('page') || '1', 10) || 1;
		const pageSize = Math.min(
			Math.max(parseInt(url.searchParams.get('pageSize') || String(DEFAULT_PAGE_SIZE), 10) || DEFAULT_PAGE_SIZE, 1),
			PAGE_SIZE_MAX
		);

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
			datasetIds,
			placeTypes,
			tags,
			tagOperator,
			timeSlice,
			sort: sort as FeaturesSortField,
			sortDirection: sortDirection as SortDirection,
			page,
			pageSize
		});

		console.log(
			`✅ Features API success - ${result.data.length} features returned (page ${result.page}/${result.totalPages}, total: ${result.total})`
		);

		const headers = {
			'Cache-Control': 'public, max-age=3600',
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
			message: 'Failed to load features'
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
