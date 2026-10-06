import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getGroupFeatures } from '@atm/db';
import { parseGroupRequest } from '$lib/server/query-params';

// the members of one group in a date window: a cinema's programmes in a year
export const GET: RequestHandler = async ({ url }) => {
	try {
		const request = parseGroupRequest(url);

		console.log(`Group features API request - ${request.datasetId}:${request.groupKey} ${request.start}..${request.end}`);

		const result = await getGroupFeatures(request);

		// the data is immutable per window, so a day of caching is safe
		return json(result, {
			headers: {
				'Cache-Control': 'public, max-age=86400',
				'Access-Control-Allow-Origin': '*'
			}
		});
	} catch (err) {
		if (err && typeof err === 'object' && 'status' in err) {
			throw err;
		}
		console.error('Group features API unexpected error:', err);
		throw error(500, { code: 'INTERNAL_ERROR', message: 'Failed to load group features' });
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
