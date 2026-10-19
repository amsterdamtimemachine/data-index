/** The page strip the features panel shows, and the page arithmetic behind it. */

export type StripItem = { kind: 'page'; value: number } | { kind: 'gap' };

export function totalPages(count: number, perPage: number): number {
	if (perPage <= 0) {
		return 1;
	}
	return Math.max(1, Math.ceil(count / perPage));
}

export function clampPage(page: number, total: number): number {
	return Math.min(Math.max(page, 1), Math.max(total, 1));
}

/**
 * A minimal strip: the current page, its successor, a gap and the last page; on the
 * last page the mirror of it, the first page, a gap, the predecessor and the last.
 * The previous and next buttons do the rest.
 */
export function pageStrip(current: number, total: number): StripItem[] {
	if (current >= total && total > 1) {
		const items: StripItem[] = [{ kind: 'page', value: 1 }];
		const prev = total - 1;
		if (prev > 1) {
			if (prev - 1 > 1) {
				items.push({ kind: 'gap' });
			}
			items.push({ kind: 'page', value: prev });
		}
		items.push({ kind: 'page', value: total });
		return items;
	}

	const items: StripItem[] = [{ kind: 'page', value: current }];
	const next = current + 1;
	let lastShown = current;
	if (next < total) {
		items.push({ kind: 'page', value: next });
		lastShown = next;
	}
	if (current < total) {
		if (total - lastShown > 1) {
			items.push({ kind: 'gap' });
		}
		items.push({ kind: 'page', value: total });
	}
	return items;
}
