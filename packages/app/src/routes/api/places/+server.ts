// src/routes/api/places/+server.ts
import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { searchPlaces, getPlaceById } from '@atm/db/queries';
import { parseGridCols } from '#lib/server/query-params.js';

export const GET: RequestHandler = async ({ url }) => {
	try {
		const q = url.searchParams.get('q');
		const id = url.searchParams.get('id');
		// Same display resolution the heatmap renders at, so returned cell indices
		// land exactly on heatmap cells.
		const cols = parseGridCols(url);
		const limit = parseInt(url.searchParams.get('limit') || '10', 10) || 10;

		if (id) {
			const nameIdParam = url.searchParams.get('nameId');
			let nameId: string | undefined = undefined;
			if (nameIdParam) {
				nameId = nameIdParam.slice(0, 512);
			}
			const match = await getPlaceById(id.slice(0, 512), { cols, nameId });
			let matches: typeof match[] = [];
			if (match) {
				matches = [match];
			}
			return Response.json({ matches }, {
				headers: {
					'Cache-Control': 'public, max-age=3600',
					'Access-Control-Allow-Origin': '*'
				}
			});
		}

		let matches: Awaited<ReturnType<typeof searchPlaces>> = [];
		if (q) {
			matches = await searchPlaces(q, { limit, cols });
		}
		return Response.json({ matches }, {
			headers: {
				'Cache-Control': 'public, max-age=3600',
				'Access-Control-Allow-Origin': '*'
			}
		});
	} catch (err) {
		if (err && typeof err === 'object' && 'status' in err) throw err;
		console.error('Places API error:', err);
		throw error(500, 'Failed to search places', { code: 'INTERNAL_ERROR' });
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
