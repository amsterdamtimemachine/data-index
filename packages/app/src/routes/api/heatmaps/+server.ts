// src/routes/api/heatmaps/+server.ts
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import type { RecordType, HeatmapResolutionConfig } from '@atm/shared/types';
import { GRID_DEFAULT, GRID_MIN, GRID_MAX, DEFAULT_BIN_SIZE, BIN_SIZE_MIN, BIN_SIZE_MAX } from '@atm/shared';
import { getHeatmap, getHeatmapTimeline } from '@atm/db/queries';

function parseGridParam(value: string | null, defaultVal: number): number {
	if (value === null) return defaultVal;
	const parsed = parseInt(value, 10);
	if (isNaN(parsed)) return defaultVal;
	return Math.min(Math.max(parsed, GRID_MIN), GRID_MAX);
}

export const GET: RequestHandler = async ({ url }) => {
	try {
		const recordTypesParam = url.searchParams.get('recordTypes');
		const timeSliceParam = url.searchParams.get('timeSlice');

		// Parse recordTypes
		const recordTypes: RecordType[] | undefined = recordTypesParam
			? (recordTypesParam.split(',').map((t) => t.trim()) as RecordType[])
			: undefined;

		// Parse datasets
		const datasetsParam = url.searchParams.get('datasets');
		const datasetIds = datasetsParam
			? datasetsParam.split(',').map((t) => t.trim())
			: undefined;

		// Parse grid resolution
		const rows = parseGridParam(url.searchParams.get('rows'), GRID_DEFAULT);
		const cols = parseGridParam(url.searchParams.get('cols'), GRID_DEFAULT);
		const resolution: HeatmapResolutionConfig = { rows, cols };

		// Parse bin size
		const binSizeParam = url.searchParams.get('binSize');
		const binSize = binSizeParam
			? Math.min(Math.max(parseInt(binSizeParam, 10) || DEFAULT_BIN_SIZE, BIN_SIZE_MIN), BIN_SIZE_MAX)
			: DEFAULT_BIN_SIZE;

		console.log(
			`🔥 Heatmaps API request - recordTypes: ${recordTypes?.join(', ') || 'all'}, timeSlice: ${timeSliceParam || 'all'}, grid: ${cols}x${rows}, binSize: ${binSize}`
		);

		if (timeSliceParam) {
			const heatmapResponse = await getHeatmap(timeSliceParam, resolution, recordTypes, datasetIds, binSize);
			const cellCount = Object.values(heatmapResponse.timeline)[0]?.indices.length ?? 0;
			console.log(`✅ Heatmap for ${timeSliceParam}: ${cellCount} cells`);

			return json(heatmapResponse, {
				headers: {
					'Cache-Control': 'public, max-age=3600',
					'Access-Control-Allow-Origin': '*'
				}
			});
		} else {
			const heatmapResponse = await getHeatmapTimeline(resolution, recordTypes, datasetIds, binSize);
			const timeSliceCount = Object.keys(heatmapResponse.timeline).length;
			const totalCells = Object.values(heatmapResponse.timeline).reduce(
				(sum, h) => sum + h.indices.length,
				0
			);

			console.log(`✅ Heatmap timeline: ${timeSliceCount} slices, ${totalCells} total cells`);

			return json(heatmapResponse, {
				headers: {
					'Cache-Control': 'public, max-age=3600',
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
