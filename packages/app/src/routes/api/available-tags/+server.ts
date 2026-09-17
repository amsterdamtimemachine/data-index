// src/routes/api/available-tags/+server.ts
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getAvailableTags } from '@atm/db';
import { parseRecordTypes, parseDatasets, parsePlaceTypes, parseSearchQuery } from '$lib/server/query-params';

export const GET: RequestHandler = async ({ url }) => {
	try {
		const recordTypes = parseRecordTypes(url);
		const datasetIds = parseDatasets(url);
		const placeTypes = parsePlaceTypes(url);
		// Optional: count within a text search, so the panel's counts match its results.
		const searchQuery = parseSearchQuery(url);

		console.log(`Available tags API request - recordTypes: ${recordTypes?.join(', ') || 'all'}, datasets: ${datasetIds?.join(', ') || 'all'}, placeTypes: ${placeTypes?.join(', ') || 'all'}, q: ${searchQuery || 'none'}`);

		const result = await getAvailableTags(recordTypes, datasetIds, placeTypes, searchQuery);

		const nonEmpty = result.tags.filter((tag) => tag.count > 0).length;
		console.log(`Available tags API success - ${result.tags.length} tags, ${nonEmpty} with features`);

		// Set appropriate cache headers
		const headers = {
			'Cache-Control': 'no-cache',
			'Access-Control-Allow-Origin': '*'
		};

		return json(result, { headers });
	} catch (err) {
		if (err && typeof err === 'object' && 'status' in err) throw err;
		console.error('Available tags API error:', err);
		throw error(500, {
			code: 'INTERNAL_ERROR',
			message: 'Failed to load available tags'
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
