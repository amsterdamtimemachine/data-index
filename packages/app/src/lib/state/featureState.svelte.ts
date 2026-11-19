// featureState.ts - Global state for feature detail viewing
import { tick } from 'svelte';
import { Dialog } from 'melt/builders';
import type { FeatureResult } from '@atm/shared/types';

let selectedFeature = $state<FeatureResult | null>(null);

// The native dialog a card opens in. It is opened by assignment, which is what calls
// showModal(); however it closes (button, Escape, a click outside) the feature clears.
const dialog = new Dialog({
	onOpenChange: (open) => {
		if (!open) {
			selectedFeature = null;
		}
	}
});

export const featureViewerState = {
	get selectedFeature() {
		return selectedFeature;
	},

	get dialog() {
		return dialog;
	},

	// the card renders first, so the dialog has its content and its name when it opens
	async openFeature(feature: FeatureResult) {
		selectedFeature = feature;
		await tick();
		if (!dialog.open) {
			dialog.open = true;
		}
	},

	closeFeature() {
		dialog.open = false;
	}
};
