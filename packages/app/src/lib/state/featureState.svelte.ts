// featureState.ts - Global state for feature detail viewing
import type { FeatureResult } from '@atm/shared/types';

let selectedFeature = $state<FeatureResult | null>(null);

export const featureViewerState = {
	get selectedFeature() {
		return selectedFeature;
	},

	openFeature(feature: FeatureResult) {
		selectedFeature = feature;
	},

	closeFeature() {
		selectedFeature = null;
	},

	get isOpen() {
		return selectedFeature !== null;
	}
};
