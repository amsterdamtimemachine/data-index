// src/routes/api/histogram/+server.ts
import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { DISPLAY_TIME_BIN_DEFAULT_YEARS } from '@atm/shared';
import { getHistogram } from '@atm/db/queries';
import { parseRecordTypes, parseDatasets, parsePlaceTypes, parseBounds, parseMatchFilters, parseGridCols } from '#lib/server/query-params.js';

export const GET: RequestHandler = async ({ url }) => {
	try {
		const recordTypes = parseRecordTypes(url);
		const datasetIds = parseDatasets(url);
		const placeTypes = parsePlaceTypes(url);
		// Optional: restrict to a WGS84 box (the mobile per-cell timeline); absent → city-wide.
		const bounds = parseBounds(url);
		// Optional: restrict to the display cells of one place (the search timeline
		// series), at the grid width the map renders.
		const placeId = url.searchParams.get('placeId')?.slice(0, 512) || undefined;
		const cols = parseGridCols(url);

		// Parse bin size
		// Forwarded as-is; the query layer clamps and snaps it to a valid bin (normaliseBinSize).
		const binSizeParam = url.searchParams.get('binSize');
		const binSize = binSizeParam ? parseInt(binSizeParam, 10) || DISPLAY_TIME_BIN_DEFAULT_YEARS : DISPLAY_TIME_BIN_DEFAULT_YEARS;

		// Optional: restrict counts to features matching a text search and/or tags.
		const filters = parseMatchFilters(url);

		console.log(`Histogram API request - recordTypes: ${recordTypes?.join(', ') || 'all'}, placeTypes: ${placeTypes?.join(', ') || 'all'}, datasets: ${datasetIds?.join(', ') || 'all'}, binSize: ${binSize}, q: ${filters.searchQuery || 'none'}, tags: ${filters.tags?.join(', ') || 'none'} (${filters.tagOperator})`);

		const histogram = await getHistogram(recordTypes, datasetIds, placeTypes, binSize, bounds, placeId, filters, cols);

		console.log(
			`Histogram: ${histogram.bins.length} bins, ${histogram.totalFeatures} total features`
		);

		return Response.json(histogram, {
			headers: {
				'Cache-Control': 'no-cache',
				'Access-Control-Allow-Origin': '*'
			}
		});
	} catch (err) {
		if (err && typeof err === 'object' && 'status' in err) throw err;
		console.error('Histogram API error:', err);
		throw error(500, 'Failed to load histogram data', { code: 'INTERNAL_ERROR' });
	}
};

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
