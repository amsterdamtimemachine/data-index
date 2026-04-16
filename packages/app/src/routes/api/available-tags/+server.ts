// src/routes/api/available-tags/+server.ts
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import type { RecordType } from '@atm/shared/types';
import { getAvailableTags } from '@atm/db';

export const GET: RequestHandler = async ({ url }) => {
	try {
		// Parse query parameters
		const recordTypesParam = url.searchParams.get('recordTypes');

		// Parse recordTypes - default to all available recordTypes if none specified
		const recordTypes = recordTypesParam
			? (recordTypesParam.split(',').map((t) => t.trim()) as RecordType[])
			: undefined;

		console.log(`🏷️ Available tags API request - recordTypes: ${recordTypes?.join(', ') || 'all'}`);

		// Get available tags from database
		const result = await getAvailableTags(recordTypes);

		const tagCount = result.tags.length;
		const totalFeatures = result.tags.reduce((sum, tag) => sum + tag.totalFeatures, 0);
		console.log(
			`✅ Available tags API success - ${tagCount} tags with ${totalFeatures} total features`
		);

		// Set appropriate cache headers
		const headers = {
			'Cache-Control': 'public, max-age=86400',
			'Access-Control-Allow-Origin': '*'
		};

		return json(result, { headers });
	} catch (err) {
		if (err && typeof err === 'object' && 'status' in err) throw err;
		console.error('❌ Available tags API error:', err);
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
