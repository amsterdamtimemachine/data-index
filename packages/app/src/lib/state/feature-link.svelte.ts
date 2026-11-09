/**
 * The expanded card in the URL, so a link restores it: `feature`, the feature's id,
 * and `at`, the place its card is at (an entry mentioned at several places has a
 * card at each). The open card writes the pair and a closed one clears it. A link's
 * pair is read once on arrival and fetched as the list's own row for it, with the
 * search term for the marks and no filter, so the card opens whatever the view
 * holds; a pair the API cannot resolve is dropped from the URL.
 */
import { untrack } from 'svelte';
import { page } from '$app/state';
import type { FeaturesResponse } from '@atm/shared/types';
import { featureViewerState } from './featureState.svelte.js';
import { parseFeatureSelection } from '#lib/utils/page-params.js';
import { apiUrl } from '#lib/utils/api.js';

export type FeatureLinkInputs = {
	searchQuery: string | null;
	writeParams: (params: Record<string, string | null>) => void;
};

export function createFeatureLink(inputs: FeatureLinkInputs) {
	const arrival = parseFeatureSelection(new URL(untrack(() => page.url.href)));
	// until the link's card is open or given up, the URL keeps its pair
	let restoring = arrival.featureId !== null;
	// the pair the URL holds, as last written: the address bar lags behind a write
	// still navigating, so it is not what to compare with
	let written = arrival;

	function write(featureId: string | null, placeId: string | null) {
		written = { featureId, placeId };
		inputs.writeParams({ feature: featureId, at: placeId });
	}

	// the open card to the URL, when they differ; only the card is tracked, so the
	// navigation the write starts cannot run this again
	$effect(() => {
		const shown = featureViewerState.selectedFeature;
		untrack(() => {
			if (restoring) {
				return;
			}
			const feature = shown?.id ?? null;
			const at = shown?.placeId ?? null;
			if (written.featureId !== feature || written.placeId !== at) {
				write(feature, at);
			}
		});
	});

	// the link's card
	$effect(() => {
		if (!restoring) {
			return;
		}
		const params = new URLSearchParams({ featureId: arrival.featureId! });
		if (arrival.placeId) {
			params.set('featurePlaceId', arrival.placeId);
		}
		const searchQuery = untrack(() => inputs.searchQuery);
		if (searchQuery) {
			params.set('q', searchQuery);
		}
		const controller = new AbortController();
		void fetch(apiUrl('/api/features', params), { signal: controller.signal })
			.then(async (response) => {
				if (!response.ok) {
					throw response;
				}
				const result: FeaturesResponse = await response.json();
				restoring = false;
				if (result.data[0]) {
					await featureViewerState.openFeature(result.data[0]);
				} else {
					untrack(() => write(null, null));
				}
			})
			.catch((err) => {
				if (controller.signal.aborted) {
					return;
				}
				restoring = false;
				untrack(() => write(null, null));
				console.error('Feature link failed:', err);
			});
		return () => controller.abort();
	});
}
