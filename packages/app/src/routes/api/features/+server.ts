import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import type { FeaturesSortField, SortDirection, FeaturesArea } from '@atm/shared/types';
import { DEFAULT_PAGE_SIZE, PAGE_SIZE_MAX } from '@atm/shared';
import { getFeatures, UnknownTimeSliceError } from '@atm/db';
import {
	parseRecordTypes,
	parseDatasets,
	parsePlaceTypes,
	parseTags,
	parseTagOperator,
	parseBounds,
	parseSeed,
	parseSearchQuery,
	parseGridCols
} from '#lib/server/query-params.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const GET: RequestHandler = async ({ url }) => {
	try {
		// one feature, as its card: the list's own row for it, with or without a population
		const featureId = url.searchParams.get('featureId') || undefined;
		if (featureId && !UUID.test(featureId)) {
			throw error(400, 'Invalid featureId', { code: 'INVALID_FEATURE_ID' });
		}
		const featurePlaceId = url.searchParams.get('featurePlaceId')?.slice(0, 512) || undefined;

		// The spatial population: the display cells a place lies in, or a display cell's
		// bounds; required unless a feature is named.
		const bounds = parseBounds(url);
		const placeIdParam = url.searchParams.get('placeId');
		let area: FeaturesArea | undefined;
		if (placeIdParam) {
			area = { kind: 'place', placeId: placeIdParam.slice(0, 512), cols: parseGridCols(url) };
		} else if (bounds) {
			area = { kind: 'bounds', bounds };
		} else if (!featureId) {
			throw error(
				400,
				'Missing required bounds parameters (minLon, maxLon, minLat, maxLat), placeId or featureId',
				{ code: 'MISSING_BOUNDS' }
			);
		}

		// Parse optional parameters
		const recordTypes = parseRecordTypes(url);
		const datasetIds = parseDatasets(url);
		const placeTypes = parsePlaceTypes(url);
		const tags = parseTags(url);
		const tagOperator = parseTagOperator(url);
		const timeSlice = url.searchParams.get('timeSlice') || undefined;
		const sort = url.searchParams.get('sort') || 'sample';
		const sortDirection = url.searchParams.get('sortDirection') || 'desc';
		const seed = parseSeed(url);
		const searchQuery = parseSearchQuery(url);

		if (!['sample', 'spatialFrequency', 'datePrecision', 'date'].includes(sort)) {
			throw error(400, 'Invalid sort field', { code: 'INVALID_SORT' });
		}
		if (!['asc', 'desc'].includes(sortDirection)) {
			throw error(400, 'Invalid sort direction', { code: 'INVALID_SORT' });
		}

		const page = Math.max(parseInt(url.searchParams.get('page') || '1', 10) || 1, 1);
		const pageSize = Math.min(
			Math.max(
				parseInt(url.searchParams.get('pageSize') || String(DEFAULT_PAGE_SIZE), 10) ||
					DEFAULT_PAGE_SIZE,
				1
			),
			PAGE_SIZE_MAX
		);

		console.log(
			`Features API request - area: ${JSON.stringify(area)}, ` +
				`recordTypes: ${recordTypes?.join(', ') || 'all'}, ` +
				`tags: ${tags?.join(', ') || 'none'} (${tagOperator}), ` +
				`timeSlice: ${timeSlice || 'all'}, ` +
				`sort: ${sort} ${sortDirection}, ` +
				`q: ${searchQuery || 'none'}, ` +
				`page: ${page}, pageSize: ${pageSize}`
		);

		const result = await getFeatures({
			area,
			recordTypes,
			datasetIds,
			placeTypes,
			tags,
			tagOperator,
			timeSlice,
			sort: sort as FeaturesSortField,
			sortDirection: sortDirection as SortDirection,
			seed,
			searchQuery,
			featureId,
			featurePlaceId,
			page,
			pageSize
		});

		console.log(
			`Features API success - ${result.data.length} features returned (page ${result.page}/${result.totalPages}, total: ${result.total})`
		);

		const headers = {
			'Cache-Control': 'public, max-age=3600',
			'Access-Control-Allow-Origin': '*'
		};

		return Response.json(result, { headers });
	} catch (err) {
		if (err && typeof err === 'object' && 'status' in err) {
			throw err; // Re-throw SvelteKit errors
		}
		if (err instanceof UnknownTimeSliceError) {
			throw error(400, err.message, { code: 'INVALID_TIME_SLICE' });
		}
		console.error('Features API unexpected error:', err);
		throw error(500, 'Failed to load features', { code: 'INTERNAL_ERROR' });
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
