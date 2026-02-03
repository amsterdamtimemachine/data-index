// src/routes/api/heatmaps/+server.ts
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import type { RecordType, HeatmapTimeline } from '@atm/shared/types';
import { getHeatmap, getHeatmapTimeline } from '@atm/db/queries';

export const GET: RequestHandler = async ({ url }) => {
	try {
		const recordTypesParam = url.searchParams.get('recordTypes');
		const timeSliceParam = url.searchParams.get('timeSlice');

		// Parse recordTypes
		const recordTypes: RecordType[] | undefined = recordTypesParam
			? (recordTypesParam.split(',').map((t) => t.trim()) as RecordType[])
			: undefined;

		console.log(
			`🔥 Heatmaps API request - recordTypes: ${recordTypes?.join(', ') || 'all'}, timeSlice: ${timeSliceParam || 'all'}`
		);

		// Single time slice or full timeline
		if (timeSliceParam) {
			const heatmap = await getHeatmap(timeSliceParam, recordTypes);
			console.log(`✅ Heatmap for ${timeSliceParam}: ${heatmap.indices.length} cells`);

			return json(
				{ [timeSliceParam]: heatmap } as HeatmapTimeline,
				{
					headers: {
						'Cache-Control': 'public, max-age=3600',
						'Access-Control-Allow-Origin': '*'
					}
				}
			);
		} else {
			const heatmapTimeline = await getHeatmapTimeline(recordTypes);
			const timeSliceCount = Object.keys(heatmapTimeline).length;
			const totalCells = Object.values(heatmapTimeline).reduce(
				(sum, h) => sum + h.indices.length,
				0
			);

			console.log(`✅ Heatmap timeline: ${timeSliceCount} slices, ${totalCells} total cells`);

			return json(heatmapTimeline, {
				headers: {
					'Cache-Control': 'public, max-age=3600',
					'Access-Control-Allow-Origin': '*'
				}
			});
		}
	} catch (err) {
		console.error('❌ Heatmaps API error:', err);
		throw error(500, {
			code: 'HEATMAP_ERROR',
			message: err instanceof Error ? err.message : 'Failed to load heatmap data'
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
