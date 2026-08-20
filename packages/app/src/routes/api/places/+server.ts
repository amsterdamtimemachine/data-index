// src/routes/api/places/+server.ts
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { DISPLAY_GRID_DEFAULT_COLS, DISPLAY_GRID_MIN_COLS, DISPLAY_GRID_MAX_COLS } from '@atm/shared';
import { searchPlaces, getPlaceById } from '@atm/db/queries';

function parseGridParam(value: string | null, defaultVal: number): number {
	if (value === null) return defaultVal;
	const parsed = parseInt(value, 10);
	if (isNaN(parsed)) return defaultVal;
	return Math.min(Math.max(parsed, DISPLAY_GRID_MIN_COLS), DISPLAY_GRID_MAX_COLS);
}

export const GET: RequestHandler = async ({ url }) => {
	try {
		const q = url.searchParams.get('q');
		const id = url.searchParams.get('id');
		// Same display resolution the heatmap renders at, so returned cell indices
		// land exactly on heatmap cells.
		const cols = parseGridParam(url.searchParams.get('cols'), DISPLAY_GRID_DEFAULT_COLS);
		const limit = parseInt(url.searchParams.get('limit') || '10', 10) || 10;

		if (id) {
			const match = await getPlaceById(id.slice(0, 512), { cols });
			let matches: typeof match[] = [];
			if (match) {
				matches = [match];
			}
			return json({ matches }, {
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
		return json({ matches }, {
			headers: {
				'Cache-Control': 'public, max-age=3600',
				'Access-Control-Allow-Origin': '*'
			}
		});
	} catch (err) {
		if (err && typeof err === 'object' && 'status' in err) throw err;
		console.error('Places API error:', err);
		throw error(500, {
			code: 'INTERNAL_ERROR',
			message: 'Failed to search places'
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
