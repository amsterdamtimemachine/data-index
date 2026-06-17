// WIP: Not currently exposed in the UI (TAGS_FEATURE_READY = false).
// validateTagCombination runs one COUNT query per selected tag sequentially.
// With large feature_tags tables (1M+ rows), consider caching or replacing
// with a single query that validates all tags at once.
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getTagCombinations, validateTagCombination } from '@atm/db';
import { parseRecordTypes, parseDatasets, parsePlaceTypes, parseList } from '$lib/server/query-params';

export const GET: RequestHandler = async ({ url }) => {
	try {
		const validateAllParam = url.searchParams.get('validateAll');

		const recordTypes = parseRecordTypes(url);
		const datasetIds = parseDatasets(url);
		const placeTypes = parsePlaceTypes(url);
		const selectedTags = parseList(url, 'selected') ?? [];

		console.log(
			`🔗 Tag combinations API request - recordTypes: ${recordTypes?.join(', ') || 'all'}, datasets: ${datasetIds?.join(', ') || 'all'}, placeTypes: ${placeTypes?.join(', ') || 'all'}, selected: ${selectedTags.join(', ') || 'none'}, validateAll: ${validateAllParam}`
		);

		const headers = {
			'Cache-Control': 'public, max-age=86400',
			'Access-Control-Allow-Origin': '*'
		};

		// Handle validation mode
		if (validateAllParam === 'true' && selectedTags.length > 0) {
			const validationResult = await validateTagCombination(recordTypes, datasetIds, placeTypes, selectedTags);

			console.log(
				`✅ Tag validation complete - valid: ${validationResult.validTags.join(', ')}, invalid: ${validationResult.invalidTags.join(', ')}`
			);

			return json(
				{
					availableTags: [],
					currentSelection: validationResult.validTags,
					recordTypes: recordTypes || [],
					validTags: validationResult.validTags,
					invalidTags: validationResult.invalidTags
				},
				{ headers }
			);
		}

		// Normal mode: get available next tags
		const result = await getTagCombinations(recordTypes, datasetIds, placeTypes, selectedTags);

		const tagCount = result.availableTags.length;
		const totalFeatures = result.availableTags.reduce((sum, tag) => sum + tag.totalFeatures, 0);
		console.log(
			`✅ Tag combinations API success - ${tagCount} available next tags with ${totalFeatures} total features`
		);

		return json(result, { headers });
	} catch (err) {
		if (err && typeof err === 'object' && 'status' in err) throw err;
		console.error('❌ Tag combinations API error:', err);
		throw error(500, {
			code: 'INTERNAL_ERROR',
			message: 'Failed to load tag combinations'
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
