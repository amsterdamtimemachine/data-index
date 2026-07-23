import type { LayoutLoad } from './$types';
import type { VisualizationMetadata } from '@atm/shared/types';
import type { AppError } from '$types/error';
import { createError } from '$utils/error';

// No `url` here — that's the point. Without a dependency that changes on filter
// navigations, SvelteKit runs this once and reuses the result across them (the page
// load reads it via parent()). Metadata is filter-independent, so it never re-fetches.
export const load: LayoutLoad = async ({ fetch }) => {
	const metadataErrors: AppError[] = [];
	let metadata: VisualizationMetadata | null = null;

	try {
		const response = await fetch('/api/metadata');
		if (!response.ok) {
			metadataErrors.push(
				createError('error', 'API Request Failed', `Failed to fetch metadata: HTTP ${response.status}`, {
					status: response.status,
					statusText: response.statusText
				})
			);
		} else {
			metadata = (await response.json()) as VisualizationMetadata;
		}
	} catch (err) {
		metadataErrors.push(
			createError(
				'error',
				'Metadata Load Failed',
				'Could not load visualization metadata. Please ensure the server is running and the binary file is available.',
				{ error: err instanceof Error ? err.message : 'Unknown error' }
			)
		);
	}

	return { metadata, metadataErrors };
};
