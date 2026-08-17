// src/routes/api/metadata/+server.ts
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getMetadata } from '@atm/db';

export const GET: RequestHandler = async () => {
	try {
		console.log('Metadata API request');

		const metadata = await getMetadata();

		console.log(
			`Metadata API success - ${metadata.timeSlices.length} time slices, ${metadata.recordTypes.length} record types`
		);

		const headers = {
			'Cache-Control': 'public, max-age=86400', // Cache for 24 hours
			'Access-Control-Allow-Origin': '*'
		};

		return json(metadata, { headers });
	} catch (err) {
		if (err && typeof err === 'object' && 'status' in err) throw err;
		console.error('Metadata API error:', err);
		throw error(500, {
			code: 'INTERNAL_ERROR',
			message: 'Failed to load metadata'
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
