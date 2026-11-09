// src/routes/api/filter-counts/+server.ts
import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getFilterCounts } from '@atm/db';
import {
	parseList,
	parseMatchFilters,
	parseBounds,
	parseGridCols
} from '#lib/server/query-params.js';

// a category written as 'none' is an emptied one: an empty list, not everything
function parseCategory(url: URL, name: string): string[] | undefined {
	if (url.searchParams.get(name) === 'none') {
		return [];
	}
	return parseList(url, name);
}

export const GET: RequestHandler = async ({ url }) => {
	try {
		const recordTypes = parseCategory(url, 'recordTypes');
		const datasetIds = parseCategory(url, 'datasets');
		const placeTypes = parseCategory(url, 'placeTypes');
		const { searchQuery, tags, tagOperator } = parseMatchFilters(url);
		const timeSlice = url.searchParams.get('timeSlice')?.slice(0, 64) || undefined;
		const bounds = parseBounds(url);
		const placeId = url.searchParams.get('placeId')?.slice(0, 512) || undefined;
		const cols = parseGridCols(url);

		console.log(
			`Filter counts API request - recordTypes: ${recordTypes?.join(', ') ?? 'all'}, datasets: ${datasetIds?.join(', ') ?? 'all'}, placeTypes: ${placeTypes?.join(', ') ?? 'all'}, tags: ${tags?.join(', ') || 'none'} (${tagOperator}), q: ${searchQuery || 'none'}, timeSlice: ${timeSlice || 'all'}, scope: ${placeId ? 'place' : bounds ? 'cell' : 'city'}`
		);

		const result = await getFilterCounts({
			recordTypes,
			datasetIds,
			placeTypes,
			tags,
			tagOperator,
			searchQuery,
			timeSlice,
			bounds,
			placeId,
			cols
		});

		console.log(`Filter counts API success - total ${result.total}`);

		return Response.json(result, {
			headers: { 'Cache-Control': 'no-cache', 'Access-Control-Allow-Origin': '*' }
		});
	} catch (err) {
		if (err && typeof err === 'object' && 'status' in err) throw err;
		console.error('Filter counts API error:', err);
		throw error(500, 'Failed to load filter counts', { code: 'INTERNAL_ERROR' });
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
