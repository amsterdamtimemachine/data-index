/**
 * Which series the timeline shows: the city-wide one, or the panel subject's (a
 * cell's or a place's). Owns the subject series, their loading state and the
 * desktop switch; the page only fetches and hands results in.
 */
import type { Histogram } from '@atm/shared/types';
import { translate } from '$utils/translations';

export type TimelineViewInputs = {
	isMobile: boolean;
	// mobile: the open cell modal or place panel is the switch
	cellModalOpen: boolean;
	placePanelOpen: boolean;
	// the open place, named as the panel names it; null without one
	placeTitle: string | null;
};

// the band while a subject's series loads: no bars, no fallback to the city-wide one
const EMPTY_HISTOGRAM: Histogram = { bins: [], maxCount: 0, timeRange: { start: '', end: '' }, totalFeatures: 0 };

/** One subject's series with its request bookkeeping. */
function createSubjectSeries() {
	let series = $state<Histogram | null>(null);
	let loading = $state(false);
	// an aborted request settles after its successor started; only the latest clears
	let latest = 0;

	function request(): { loaded: (h: Histogram) => void; settled: () => void } {
		series = null;
		loading = true;
		const id = ++latest;
		return {
			loaded(h: Histogram) {
				series = h;
			},
			settled() {
				if (id === latest) {
					loading = false;
				}
			}
		};
	}

	function clear() {
		series = null;
		loading = false;
		++latest;
	}

	return {
		get series() {
			if (!series || series.bins.length === 0) {
				return null;
			}
			return series;
		},
		get loading() {
			return loading;
		},
		request,
		clear
	};
}

export function createTimelineView(getInputs: () => TimelineViewInputs) {
	const cell = createSubjectSeries();
	const place = createSubjectSeries();
	// the desktop switch; off by default, so selecting never flips the view by itself
	let switchOn = $state(false);

	// the subject's series: the open place's, else the cell's
	const series = $derived.by(() => {
		if (getInputs().placePanelOpen) {
			return place.series;
		}
		return cell.series;
	});
	const pending = $derived(cell.loading || place.loading);
	const available = $derived(series !== null || pending);

	const showsLocal = $derived.by(() => {
		const inputs = getInputs();
		if (inputs.isMobile) {
			return inputs.cellModalOpen || inputs.placePanelOpen;
		}
		return switchOn;
	});

	// what the timeline gets: nothing (city-wide), the subject's series, or the empty band
	const histogram = $derived.by(() => {
		if (!showsLocal) {
			return null;
		}
		if (series) {
			return series;
		}
		if (pending) {
			return EMPTY_HISTOGRAM;
		}
		return null;
	});

	const label = $derived.by(() => {
		const inputs = getInputs();
		if (inputs.placePanelOpen && inputs.placeTitle) {
			return `${translate('timelineOf')} ${inputs.placeTitle}`;
		}
		return translate('timelineOfCell');
	});

	function toggle() {
		switchOn = !switchOn;
	}

	// losing the last subject ends the local view: the next selection starts city-wide
	function resetIfIdle() {
		if (!available) {
			switchOn = false;
		}
	}

	return {
		get histogram() {
			return histogram;
		},
		get label() {
			return label;
		},
		get available() {
			return available;
		},
		get switchOn() {
			return switchOn;
		},
		/** the switch handler for the timeline; absent on mobile, where the modal decides */
		get onToggle() {
			if (getInputs().isMobile) {
				return undefined;
			}
			return toggle;
		},
		cellRequest() {
			return cell.request();
		},
		clearCell() {
			cell.clear();
			resetIfIdle();
		},
		placeRequest() {
			return place.request();
		},
		clearPlace() {
			place.clear();
			resetIfIdle();
		},
		/** call when a request settles without a series, so an idle view resets too */
		settled() {
			resetIfIdle();
		}
	};
}
