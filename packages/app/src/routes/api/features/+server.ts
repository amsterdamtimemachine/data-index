import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import type { FeaturesSortField, SortDirection, TagOperator } from '@atm/shared/types';
import { DEFAULT_PAGE_SIZE, PAGE_SIZE_MAX } from '@atm/shared';
import { getFeatures } from '@atm/db';
import { parseRecordTypes, parseDatasets, parsePlaceTypes, parseList } from '$lib/server/query-params';

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
		// Reject inverted/degenerate boxes up front (min must be below max on both
		// axes) rather than doing a grid lookup + empty query for a box that can
		// never contain anything. getFeatures already clamps a valid box to the data
		// extent, so an oversized-but-ordered box is handled there.
		if (bounds.minLon >= bounds.maxLon || bounds.minLat >= bounds.maxLat) {
			throw error(400, {
				code: 'INVALID_BOUNDS',
				message: 'Bounds must have minLon < maxLon and minLat < maxLat'
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
