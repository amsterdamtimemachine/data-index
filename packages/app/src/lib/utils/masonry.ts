// Order-stable masonry layout in three batched phases: park every item in one column
// and measure with a single reflow, assign greedily to the shortest column in JS, then
// move items in one write pass. Distribution order comes from each item's data-index
// (the render order), not DOM order — after a layout the DOM holds items in column
// order, so re-collecting without the sort would scramble placement across relayouts.

export interface MasonryInstance {
	layout: (columns: number, force?: boolean) => void;
	destroy: () => void;
}

export function createMasonry(container: HTMLElement): MasonryInstance {
	const columns = Array.from(container.querySelectorAll<HTMLElement>('.masonry-column'));
	if (columns.length === 0) {
		throw new Error('No columns found with class .masonry-column');
	}

	let lastColumnCount: number | null = null;

	function layout(columnCount: number, force = false): void {
		const count = Math.min(columnCount, columns.length);
		if (!force && count === lastColumnCount) return;
		lastColumnCount = count;

		const items = Array.from(container.querySelectorAll<HTMLElement>('.masonry-item')).sort(
			(a, b) => Number(a.dataset.index) - Number(b.dataset.index)
		);
		if (items.length === 0) return;

		const active = columns.slice(0, count);

		// Phase 1 — writes, then reads: park everything in the first column so each item
		// takes its final width (all columns share one track size), then measure in one
		// pass. No interleaved write/read, so the browser reflows once.
		for (const item of items) active[0].appendChild(item);
		const gap = parseFloat(getComputedStyle(active[0]).rowGap) || 16;
		const heights = items.map((item) => item.offsetHeight);

		// Phase 2 —  greedy shortest-column assignment on the measured heights.
		const columnHeights = new Array<number>(count).fill(0);
		const assignment = heights.map((h) => {
			let shortest = 0;
			for (let c = 1; c < count; c++) {
				if (columnHeights[c] < columnHeights[shortest]) shortest = c;
			}
			columnHeights[shortest] += h + (columnHeights[shortest] > 0 ? gap : 0);
			return shortest;
		});

		// Phase 3 — writes only: move items to their columns via fragments.
		const fragments = active.map(() => document.createDocumentFragment());
		items.forEach((item, i) => fragments[assignment[i]].appendChild(item));
		active.forEach((column, i) => column.appendChild(fragments[i]));
	}

	return {
		layout,
		destroy: () => {
			// Return items to the container so the DOM ends where the renderer put them.
			for (const column of columns) {
				while (column.firstChild) container.appendChild(column.firstChild);
			}
		}
	};
}
