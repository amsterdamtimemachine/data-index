// src/routes/api/heatmaps/+server.ts
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import type { HeatmapResolutionConfig } from '@atm/shared/types';
import { GRID_DEFAULT, GRID_MIN, GRID_MAX, DEFAULT_BIN_SIZE } from '@atm/shared';
import { getHeatmap, getHeatmapTimeline } from '@atm/db/queries';
import { parseRecordTypes, parseDatasets, parsePlaceTypes } from '$lib/server/query-params';

function parseGridParam(value: string | null, defaultVal: number): number {
	if (value === null) return defaultVal;
	const parsed = parseInt(value, 10);
	if (isNaN(parsed)) return defaultVal;
	return Math.min(Math.max(parsed, GRID_MIN), GRID_MAX);
}

export const GET: RequestHandler = async ({ url }) => {
	try {
		const timeSliceParam = url.searchParams.get('timeSlice');
		const recordTypes = parseRecordTypes(url);
		const datasetIds = parseDatasets(url);
		const placeTypes = parsePlaceTypes(url);

		// Parse grid resolution — only width (cols); rows are derived from the data's
		// aspect ratio server-side so display cells are square.
		const cols = parseGridParam(url.searchParams.get('cols'), GRID_DEFAULT);
		const resolution: HeatmapResolutionConfig = { cols };

		// Parse bin size
		// Forwarded as-is; the query layer clamps and snaps it to a valid bin (normaliseBinSize).
		const binSizeParam = url.searchParams.get('binSize');
		const binSize = binSizeParam ? parseInt(binSizeParam, 10) || DEFAULT_BIN_SIZE : DEFAULT_BIN_SIZE;

		console.log(
			`🔥 Heatmaps API request - recordTypes: ${recordTypes?.join(', ') || 'all'}, placeTypes: ${placeTypes?.join(', ') || 'all'}, datasets: ${datasetIds?.join(', ') || 'all'}, timeSlice: ${timeSliceParam || 'all'}, grid width: ${cols} cols, binSize: ${binSize}`
		);

		if (timeSliceParam) {
			const heatmapResponse = await getHeatmap(timeSliceParam, resolution, recordTypes, datasetIds, placeTypes, binSize);
			const cellCount = Object.values(heatmapResponse.timeline)[0]?.indices.length ?? 0;
			console.log(`✅ Heatmap for ${timeSliceParam}: ${cellCount} cells`);

			return json(heatmapResponse, {
				headers: {
					'Cache-Control': 'no-cache',
					'Access-Control-Allow-Origin': '*'
				}
			});
		} else {
			const heatmapResponse = await getHeatmapTimeline(resolution, recordTypes, datasetIds, placeTypes, binSize);
			const timeSliceCount = Object.keys(heatmapResponse.timeline).length;
			const totalCells = Object.values(heatmapResponse.timeline).reduce(
				(sum, h) => sum + h.indices.length,
				0
			);

			console.log(`✅ Heatmap timeline: ${timeSliceCount} slices, ${totalCells} total cells`);

			return json(heatmapResponse, {
				headers: {
					'Cache-Control': 'no-cache',
					'Access-Control-Allow-Origin': '*'
				}
			});
		}
	} catch (err) {
		if (err && typeof err === 'object' && 'status' in err) throw err;
		console.error('❌ Heatmaps API error:', err);
		throw error(500, {
			code: 'INTERNAL_ERROR',
			message: 'Failed to load heatmap data'
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
