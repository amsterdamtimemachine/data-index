<script lang="ts" module>
	import resolveConfig from 'tailwindcss/resolveConfig';
	import tailwindConfig from '$tailwindConfig';
	const colors = resolveConfig(tailwindConfig).theme.colors as unknown as Record<string, string>;
</script>

<script lang="ts">
	import type { HeatmapTimeline, HeatmapDimensions } from '@atm/shared/types';
	import { parseRowColFromCellId } from '$utils/heatmap';
	import { mergeCss } from '$utils/utils';

	type Props = {
		timeline: HeatmapTimeline;
		dimensions: HeatmapDimensions;
		cellId?: string;
		// display-cell indices of the active place filter, in gold
		highlightCells?: number[];
		// the place is the panel's subject: red core inside the gold
		highlightSelected?: boolean;
		period: string;
		width?: number;
		height?: number;
		class?: string;
	};
	let { timeline, dimensions, cellId = undefined, highlightCells = undefined, highlightSelected = false, period, width = 150, height = 75, class: className }: Props = $props();

	const MIN_MARKER_PX = 5;

	let canvas = $state<HTMLCanvasElement>();

	$effect(() => {
		const ctx = canvas?.getContext('2d');
		if (!ctx) return;
		const { colsAmount: cols, rowsAmount: rows } = dimensions;
		let selected: { row: number; col: number } | null = null;
		if (cellId) {
			selected = parseRowColFromCellId(cellId);
		}
		const dpr = Math.min(window.devicePixelRatio || 1, 2);

		ctx.resetTransform();
		ctx.scale(dpr, dpr);
		ctx.clearRect(0, 0, width, height);

		// row 0 is south, canvas y grows downward, hence the flip
		const s = Math.min(width / cols, height / rows);
		const ox = (width - cols * s) / 2;
		const oy = (height - rows * s) / 2;
		const cellX = (idx: number) => ox + (idx % cols) * s;
		const cellY = (idx: number) => oy + (rows - 1 - Math.floor(idx / cols)) * s;
		const px = Math.max(s, 1);

		const heatmap = timeline[period];
		if (heatmap) {
			ctx.fillStyle = colors['atm-blue'];
			for (const i of heatmap.indices) ctx.fillRect(cellX(i), cellY(i), px, px);
		}

		// place cells in gold; when the place is the subject, a red pass overpaints
		// interior gold, leaving a gold rim around a red shape (the map's grammar)
		if (highlightCells && highlightCells.length > 0) {
			let m = px;
			if (highlightCells.length === 1) {
				m = Math.max(s, MIN_MARKER_PX);
			}
			let rim = 0;
			if (highlightSelected) {
				rim = 2;
			}
			ctx.fillStyle = colors['map-place-outline'];
			for (const i of highlightCells) {
				ctx.fillRect(cellX(i) - (m - s) / 2 - rim, cellY(i) - (m - s) / 2 - rim, m + rim * 2, m + rim * 2);
			}
			if (highlightSelected) {
				ctx.fillStyle = colors['atm-red'];
				for (const i of highlightCells) {
					ctx.fillRect(cellX(i) - (m - s) / 2, cellY(i) - (m - s) / 2, m, m);
				}
			}
		}

		if (selected) {
			const idx = selected.row * cols + selected.col;
			const m = Math.max(s, MIN_MARKER_PX);
			ctx.fillStyle = colors['atm-red'];
			ctx.fillRect(cellX(idx) - (m - s) / 2, cellY(idx) - (m - s) / 2, m, m);
		}
	});
</script>

<canvas
	bind:this={canvas}
	width={width * Math.min((typeof window !== 'undefined' && window.devicePixelRatio) || 1, 2)}
	height={height * Math.min((typeof window !== 'undefined' && window.devicePixelRatio) || 1, 2)}
	style="width: {width}px; height: {height}px"
	class={mergeCss('block rounded border border-[1px] border-atm-gold', className)}
	aria-label="Positie van de geselecteerde cel op de kaart"
></canvas>
