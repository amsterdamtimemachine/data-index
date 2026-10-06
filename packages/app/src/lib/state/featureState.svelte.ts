/**
 * The feature open in the detail modal, and for a group row the year it shows:
 * the years come with the row, each year's members load here on selection and
 * stay for the session, so switching back is instant.
 */
import type { FeatureResult, GroupFeature, GroupFeaturesResponse } from '@atm/shared/types';
import { apiUrl } from '$utils/api';
import { loadingState } from '$lib/state/loadingState.svelte';
import { addToast } from '$state/toaster.svelte';
import { translate } from '$utils/translations';
import { yearWindow } from '$utils/format';

let selectedFeature = $state<FeatureResult | null>(null);
let selectedYear = $state<number | null>(null);
// group and year → its members
let loadedYears = $state<Map<string, GroupFeature[]>>(new Map());
let yearLoading = $state(false);
// last-wins: a stale response must not overwrite a newer one
let requestId = 0;
let hasReportedFailure = false;

function yearKey(feature: FeatureResult, year: number): string {
	return `${feature.datasetId}:${feature.groupKey}:${year}`;
}

function firstYear(feature: FeatureResult): number | null {
	if (feature.entity?.type !== 'EventSeries' || feature.entity.years.length === 0) {
		return null;
	}
	return feature.entity.years[0].year;
}

async function loadYear(feature: FeatureResult, year: number) {
	const key = yearKey(feature, year);
	if (loadedYears.has(key) || !feature.datasetId || !feature.groupKey) {
		return;
	}
	const id = ++requestId;
	yearLoading = true;
	loadingState.startLoading();
	try {
		const window = yearWindow(year);
		const params = new URLSearchParams({
			dataset: feature.datasetId,
			groupKey: feature.groupKey,
			start: window.start,
			end: window.end
		});
		const response = await fetch(apiUrl('/api/features/group', params));
		if (!response.ok) {
			throw new Error(`HTTP ${response.status}`);
		}
		const data: GroupFeaturesResponse = await response.json();
		if (id !== requestId) {
			return;
		}
		const next = new Map(loadedYears);
		next.set(key, data.data);
		loadedYears = next;
	} catch (err) {
		console.error('Group year failed:', err);
		if (id !== requestId) {
			return;
		}
		if (!hasReportedFailure) {
			hasReportedFailure = true;
			addToast({
				data: {
					title: translate('groupYearFailedTitle'),
					description: translate('groupYearFailed'),
					type: 'error'
				}
			});
		}
	} finally {
		if (id === requestId) {
			yearLoading = false;
		}
		loadingState.stopLoading();
	}
}

export const featureViewerState = {
	get selectedFeature() {
		return selectedFeature;
	},

	get selectedYear() {
		return selectedYear;
	},

	/** the selected year's members, once loaded */
	get yearFeatures(): GroupFeature[] {
		if (!selectedFeature || selectedYear === null) {
			return [];
		}
		return loadedYears.get(yearKey(selectedFeature, selectedYear)) ?? [];
	},

	get yearLoading() {
		return yearLoading;
	},

	openFeature(feature: FeatureResult) {
		selectedFeature = feature;
		selectedYear = firstYear(feature);
		if (selectedYear !== null) {
			void loadYear(feature, selectedYear);
		}
	},

	selectYear(year: number) {
		if (!selectedFeature) {
			return;
		}
		selectedYear = year;
		void loadYear(selectedFeature, year);
	},

	closeFeature() {
		selectedFeature = null;
		selectedYear = null;
	},

	get isOpen() {
		return selectedFeature !== null;
	}
};
