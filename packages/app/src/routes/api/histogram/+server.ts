// src/routes/api/histogram/+server.ts
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { DEFAULT_BIN_SIZE } from '@atm/shared';
import { getHistogram } from '@atm/db/queries';
import { parseRecordTypes, parseDatasets, parsePlaceTypes } from '$lib/server/query-params';

export const GET: RequestHandler = async ({ url }) => {
	try {
		const recordTypes = parseRecordTypes(url);
		const datasetIds = parseDatasets(url);
		const placeTypes = parsePlaceTypes(url);

		// Parse bin size
		// Forwarded as-is; the query layer clamps and snaps it to a valid bin (normaliseBinSize).
		const binSizeParam = url.searchParams.get('binSize');
		const binSize = binSizeParam ? parseInt(binSizeParam, 10) || DEFAULT_BIN_SIZE : DEFAULT_BIN_SIZE;

		console.log(`📊 Histogram API request - recordTypes: ${recordTypes?.join(', ') || 'all'}, placeTypes: ${placeTypes?.join(', ') || 'all'}, datasets: ${datasetIds?.join(', ') || 'all'}, binSize: ${binSize}`);

		const histogram = await getHistogram(recordTypes, datasetIds, placeTypes, binSize);

		console.log(
			`✅ Histogram: ${histogram.bins.length} bins, ${histogram.totalFeatures} total features`
		);

		return json(histogram, {
			headers: {
				'Cache-Control': 'no-cache',
				'Access-Control-Allow-Origin': '*'
			}
		});
	} catch (err) {
		if (err && typeof err === 'object' && 'status' in err) throw err;
		console.error('❌ Histogram API error:', err);
		throw error(500, {
			code: 'INTERNAL_ERROR',
			message: 'Failed to load histogram data'
		});
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
