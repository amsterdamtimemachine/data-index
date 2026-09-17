/**
 * The map's camera padding: the nav on the left, the panel on the right, so the
 * visible strip between them is what the camera centres on. Both are measured from
 * their elements. The panel's width is taken when it opens; a resize while open
 * must not move the map. Mobile has neither overlay.
 */
import { untrack } from 'svelte';
import { createElementWidth } from '$utils/media.svelte';

export type MapPaddingInputs = {
	navElement: HTMLElement | undefined;
	panelElement: HTMLElement | undefined;
	navExpanded: boolean;
	panelOpen: boolean;
	isMobile: boolean;
};

export type MapPadding = { left: number; right: number };

export function createMapPadding(inputs: MapPaddingInputs) {
	const navWidth = createElementWidth(() => inputs.navElement);
	let panelPadding = $state(0);

	$effect(() => {
		const open = inputs.panelOpen && !inputs.isMobile;
		const element = inputs.panelElement;
		untrack(() => {
			if (open && element) {
				panelPadding = element.offsetWidth;
			} else {
				panelPadding = 0;
			}
		});
	});

	const padding = $derived.by((): MapPadding => {
		if (inputs.isMobile) {
			return { left: 0, right: 0 };
		}
		let left = 0;
		if (inputs.navExpanded) {
			left = navWidth.px;
		}
		return { left, right: panelPadding };
	});

	return {
		get padding() {
			return padding;
		}
	};
}
