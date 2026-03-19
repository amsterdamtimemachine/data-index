// src/routes/api/histogram/+server.ts
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import type { RecordType, Histogram } from '@atm/shared/types';
import { DEFAULT_BIN_SIZE, BIN_SIZE_MIN, BIN_SIZE_MAX } from '@atm/shared';
import { getHistogram } from '@atm/db/queries';

export const GET: RequestHandler = async ({ url }) => {
	try {
		const recordTypesParam = url.searchParams.get('recordTypes');

		// Parse recordTypes
		const recordTypes: RecordType[] | undefined = recordTypesParam
			? (recordTypesParam.split(',').map((t) => t.trim()) as RecordType[])
			: undefined;

		// Parse bin size
		const binSizeParam = url.searchParams.get('binSize');
		const binSize = binSizeParam
			? Math.min(Math.max(parseInt(binSizeParam, 10) || DEFAULT_BIN_SIZE, BIN_SIZE_MIN), BIN_SIZE_MAX)
			: DEFAULT_BIN_SIZE;

		console.log(`📊 Histogram API request - recordTypes: ${recordTypes?.join(', ') || 'all'}, binSize: ${binSize}`);

		const histogram = await getHistogram(recordTypes, binSize);

		console.log(
			`✅ Histogram: ${histogram.bins.length} bins, ${histogram.totalFeatures} total features`
		);

		return json(histogram, {
			headers: {
				'Cache-Control': 'public, max-age=3600',
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
