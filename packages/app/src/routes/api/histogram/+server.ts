// src/routes/api/histogram/+server.ts
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import type { RecordType, Histogram } from '@atm/shared/types';
import { getHistogram } from '@atm/db/queries';

export const GET: RequestHandler = async ({ url }) => {
	try {
		const recordTypesParam = url.searchParams.get('recordTypes');

		// Parse recordTypes
		const recordTypes: RecordType[] | undefined = recordTypesParam
			? (recordTypesParam.split(',').map((t) => t.trim()) as RecordType[])
			: undefined;

		console.log(`📊 Histogram API request - recordTypes: ${recordTypes?.join(', ') || 'all'}`);

		const histogram = await getHistogram(recordTypes);

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
