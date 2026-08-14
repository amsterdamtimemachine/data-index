<script lang="ts" module>
	export type PanelCols = number;

	const CARD_PX = 320;
	const GRID_GAP_PX = 16;
	const GRID_PADDING_PX = 24;

	function panelWidthPx(cols: PanelCols): number {
		return cols * CARD_PX + (cols - 1) * GRID_GAP_PX + GRID_PADDING_PX;
	}

	// --nav-reserved (app.pcss) keeps the filter nav reachable beside the panel
	export function panelWidthCss(cols: PanelCols): string {
		return `min(${panelWidthPx(cols)}px, calc(100vw - var(--nav-reserved)))`;
	}

	function navReservedPx(): number {
		const raw = getComputedStyle(document.documentElement).getPropertyValue('--nav-reserved');
		const parsed = parseFloat(raw);
		if (Number.isNaN(parsed)) {
			return 282;
		}
		return parsed;
	}

	// largest count whose columns all keep their full card width
	function maxPanelCols(): number {
		const available = window.innerWidth - navReservedPx();
		let cols = 1;
		while (panelWidthPx(cols + 1) <= available) {
			cols += 1;
		}
		return cols;
	}
</script>

<script lang="ts">
	import { onMount } from 'svelte';

	type Props = {
		cols: PanelCols;
		onSizeChange: (cols: PanelCols) => void;
	};
	let { cols, onSizeChange }: Props = $props();

	let dragging = $state(false);
	let maxCols = $state(1);

	function syncMaxCols() {
		maxCols = maxPanelCols();
		if (cols > maxCols) {
			onSizeChange(maxCols);
		}
	}

	onMount(syncMaxCols);

	function nearestCols(clientX: number): PanelCols {
		const desired = window.innerWidth - clientX;
		let best = 1;
		let bestDistance = Math.abs(desired - panelWidthPx(1));
		for (let candidate = 2; candidate <= maxCols; candidate++) {
			const distance = Math.abs(desired - panelWidthPx(candidate));
			if (distance < bestDistance) {
				best = candidate;
				bestDistance = distance;
			}
		}
		return best;
	}

	function handlePointerDown(event: PointerEvent) {
		dragging = true;
		(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
		event.preventDefault();
	}

	function handlePointerMove(event: PointerEvent) {
		if (!dragging) {
			return;
		}
		const next = nearestCols(event.clientX);
		if (next !== cols) {
			onSizeChange(next);
		}
	}

	function handlePointerUp() {
		dragging = false;
	}

	// the panel is anchored right, so dragging left widens it
	function handleKeyDown(event: KeyboardEvent) {
		let next = cols;
		if (event.key === 'ArrowLeft') {
			next = Math.min(maxCols, cols + 1);
		} else if (event.key === 'ArrowRight') {
			next = Math.max(1, cols - 1);
		} else {
			return;
		}
		event.preventDefault();
		if (next !== cols) {
			onSizeChange(next);
		}
	}
</script>

<svelte:window onresize={syncMaxCols} />

<!-- ARIA window-splitter: a focusable separator is the spec pattern, but svelte's
     checker treats separator as noninteractive -->
<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
<div
	role="separator"
	tabindex="0"
	aria-orientation="vertical"
	aria-label="Paneelbreedte (kolommen)"
	aria-valuemin={1}
	aria-valuemax={maxCols}
	aria-valuenow={cols}
	class="hidden md:block absolute inset-y-0 left-0 w-1.5 z-20 cursor-ew-resize touch-none hover:bg-atm-gold focus-visible:bg-atm-gold focus-visible:outline-none"
	class:bg-atm-gold={dragging}
	onpointerdown={handlePointerDown}
	onpointermove={handlePointerMove}
	onpointerup={handlePointerUp}
	onpointercancel={handlePointerUp}
	onkeydown={handleKeyDown}
></div>
