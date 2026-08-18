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
		cellId: string;
		period: string;
		width?: number;
		height?: number;
		class?: string;
	};
	let { timeline, dimensions, cellId, period, width = 150, height = 75, class: className }: Props = $props();

	const MIN_MARKER_PX = 5;

	let canvas = $state<HTMLCanvasElement>();

	$effect(() => {
		const ctx = canvas?.getContext('2d');
		if (!ctx) return;
		const { colsAmount: cols, rowsAmount: rows } = dimensions;
		const selected = parseRowColFromCellId(cellId);
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
