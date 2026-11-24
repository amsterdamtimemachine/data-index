import type { LayoutLoad } from './$types';
import type { VisualizationMetadata } from '@atm/shared/types';
import { apiUrl } from '#lib/utils/api.js';
import { describeFailure, type Failure } from '#lib/utils/fetchJson.js';

// No `url` here — that's the point. Without a dependency that changes on filter
// navigations, SvelteKit runs this once and reuses the result across them (the page
// load reads it via parent()). Metadata is filter-independent, so it never re-fetches.
// A loader cannot show a toast, so a failure travels to the page described.
export const load: LayoutLoad = async ({ fetch }) => {
	let metadata: VisualizationMetadata | null = null;
	let metadataFailure: Failure | null = null;

	try {
		const response = await fetch(apiUrl('/api/metadata'));
		if (!response.ok) {
			throw response;
		}
		metadata = (await response.json()) as VisualizationMetadata;
	} catch (err) {
		console.warn('Metadata load failed:', err);
		metadataFailure = describeFailure(err);
	}

	return { metadata, metadataFailure };
};
