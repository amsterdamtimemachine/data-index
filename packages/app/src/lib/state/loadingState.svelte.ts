/**
 * The page's loading, as one counter anything can hold (the heatmap request, the
 * feature list, the expanded card's pictures), and the bar that shows it: while the
 * count is up the bar fills at a steady pace to FILL_CAP and waits there; when it
 * returns to zero the bar runs on to the end at the same pace, shows there for a
 * moment, and is gone. The bar's state lives here, not in the component that draws
 * it, so a bar that unmounts for another (the dialog's for the page's) does not
 * start over. The logic reads only plain variables: a loader counts itself in from
 * an effect, and a reactive read here would make that effect depend on the bar's
 * every frame.
 */
const FILL_CAP = 90;
const FILL_MS = 400;
const DONE_MS = 100;

function createLoadingState() {
	let isLoading = $state(false);
	let loadingCount = 0;

	// what the bars draw
	let barValue = $state(0);
	let barVisible = $state(false);
	// the same, for the logic
	let value = 0;
	let visible = false;
	let rafId: number | null = null;
	let doneTimer: ReturnType<typeof setTimeout> | null = null;

	function show(next: number, on: boolean) {
		value = next;
		visible = on;
		barValue = next;
		barVisible = on;
	}

	function stopRaf() {
		if (rafId !== null) {
			cancelAnimationFrame(rafId);
			rafId = null;
		}
	}

	function clearDone() {
		if (doneTimer) {
			clearTimeout(doneTimer);
			doneTimer = null;
		}
	}

	// from where the bar is, at FILL_CAP per FILL_MS, up to `to`
	function fill(to: number, onDone?: () => void) {
		stopRaf();
		const from = value;
		const t0 = performance.now();
		const step = () => {
			show(Math.min(to, from + (FILL_CAP * (performance.now() - t0)) / FILL_MS), true);
			if (value < to) {
				rafId = requestAnimationFrame(step);
			} else {
				rafId = null;
				onDone?.();
			}
		};
		rafId = requestAnimationFrame(step);
	}

	function barStart() {
		if (typeof requestAnimationFrame === 'undefined') {
			return;
		}
		clearDone();
		if (value >= FILL_CAP) {
			show(0, true);
		} else {
			show(value, true);
		}
		fill(FILL_CAP);
	}

	function barStop() {
		if (!visible) {
			return;
		}
		fill(100, () => {
			doneTimer = setTimeout(() => show(0, false), DONE_MS);
		});
	}

	return {
		get isLoading() {
			return isLoading;
		},
		// the bar's fill, 0 to 100, and whether it shows
		get barValue() {
			return barValue;
		},
		get barVisible() {
			return barVisible;
		},
		// the counter alone decides, so a loader calling these from an effect does not
		// come to depend on the flag it sets
		startLoading: () => {
			loadingCount++;
			if (loadingCount === 1) {
				isLoading = true;
				barStart();
			}
		},
		stopLoading: () => {
			if (loadingCount === 0) {
				return;
			}
			loadingCount--;
			if (loadingCount === 0) {
				isLoading = false;
				barStop();
			}
		},
		reset: () => {
			loadingCount = 0;
			isLoading = false;
			stopRaf();
			clearDone();
			show(0, false);
		}
	};
}

export const loadingState = createLoadingState();
