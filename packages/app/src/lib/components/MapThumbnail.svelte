<script lang="ts">
	import type { HeatmapTimeline, HeatmapDimensions } from '@atm/shared/types';
	import { parseRowColFromCellId } from '$utils/heatmap';
	import { mergeCss } from '$utils/utils';
	import resolveConfig from 'tailwindcss/resolveConfig';
	import tailwindConfig from '$tailwindConfig';

	type Props = {
		timeline: HeatmapTimeline;
		dimensions: HeatmapDimensions;
		cellId: string;
		class?: string;
	};
	let { timeline, dimensions, cellId, class: className }: Props = $props();

	const W = 150;
	const H = 75;
	// a real cell is ~1px at this scale — the marker is a locator, draw it visible
	const MIN_MARKER_PX = 5;

	const colors = resolveConfig(tailwindConfig).theme.colors as unknown as Record<string, string>;

	let canvas = $state<HTMLCanvasElement>();

	// Stable city silhouette: the union of populated cells across ALL periods, so the
	// orientation anchor keeps its shape while the user drags the timeline. Recomputed
	// only when the timeline itself is replaced (a filter change), not per period.
	const unionIndices = $derived.by(() => {
		const union = new Set<number>();
		for (const hm of Object.values(timeline)) {
			for (const i of hm.indices) union.add(i);
		}
		return union;
	});

	$effect(() => {
		const ctx = canvas?.getContext('2d');
		if (!ctx) return;
		const { colsAmount: cols, rowsAmount: rows } = dimensions;
		const selected = parseRowColFromCellId(cellId);
		const dpr = Math.min(window.devicePixelRatio || 1, 2);

		ctx.resetTransform();
		ctx.scale(dpr, dpr);
		ctx.clearRect(0, 0, W, H);

		// letterbox the grid's true aspect into W×H (cells are square in RD, so
		// cols:rows is the geographic aspect); row 0 is the RD origin = SOUTH,
		// canvas y grows downward, hence the row flip
		const s = Math.min(W / cols, H / rows);
		const ox = (W - cols * s) / 2;
		const oy = (H - rows * s) / 2;
		const cellX = (idx: number) => ox + (idx % cols) * s;
		const cellY = (idx: number) => oy + (rows - 1 - Math.floor(idx / cols)) * s;
		const px = Math.max(s, 1);

		ctx.fillStyle = colors['atm-sand-border'] ?? 'rgba(0,0,0,0.2)';
		for (const i of unionIndices) ctx.fillRect(cellX(i), cellY(i), px, px);

		if (selected) {
			const idx = selected.row * cols + selected.col;
			const m = Math.max(s, MIN_MARKER_PX);
			ctx.fillStyle = colors['atm-red'] ?? '#ee5e00';
			ctx.fillRect(cellX(idx) - (m - s) / 2, cellY(idx) - (m - s) / 2, m, m);
		}
	});
</script>

<!-- RTS-style minimap: the all-time data footprint as the city silhouette, plus the
     selected cell as an oversized red marker. Deliberately period-AGNOSTIC — the
     mobile timeline below shows the cell's local histogram, so a per-period layer
     here would shift for city-wide reasons unrelated to those bars. Backing store
     at devicePixelRatio for crispness; CSS size stays 150×75. -->
<canvas
	bind:this={canvas}
	width={W * Math.min((typeof window !== 'undefined' && window.devicePixelRatio) || 1, 2)}
	height={H * Math.min((typeof window !== 'undefined' && window.devicePixelRatio) || 1, 2)}
	style="width: {W}px; height: {H}px"
	class={mergeCss('block', className)}
	aria-label="Positie van de geselecteerde cel op de kaart"
></canvas>
