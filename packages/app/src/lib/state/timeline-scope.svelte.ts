/**
 * The timeline's scope: the whole city, or the panel subject (a cell or a place).
 * Owns the subject series, their fetching and loading state, and the desktop switch
 * between the two; the page only describes the subject.
 */
import type { Histogram, HeatmapCellBounds } from '@atm/shared/types';
import { translate } from '$utils/translations';
import { apiUrl } from '$utils/api';
import { fetchJson } from '$utils/fetchJson';

// read lazily, so an effect tracks only the fields it uses
export type TimelineScopeInputs = {
	isMobile: boolean;
	// mobile: the open cell modal or place panel is the switch
	cellModalOpen: boolean;
	placePanelOpen: boolean;
	// the open place, named as the panel names it; null without one
	placeTitle: string | null;
	// the subjects' series are fetched from these: the selected cell's bounds, the
	// open place's id, and the filter params every fetch inherits
	cellBounds: HeatmapCellBounds | null;
	placeId: string | null;
	params: string;
};

export type Fetcher = typeof fetchJson;

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

export function createTimelineScope(inputs: TimelineScopeInputs, fetcher: Fetcher = fetchJson) {
	const cell = createSubjectSeries();
	const place = createSubjectSeries();
	// the desktop switch; off by default, so selecting never flips the view by itself
	let switchOn = $state(false);

	// the subject's series: the open place's, else the cell's
	const series = $derived.by(() => {
		if (inputs.placePanelOpen) {
			return place.series;
		}
		return cell.series;
	});
	const pending = $derived(cell.loading || place.loading);
	const available = $derived(series !== null || pending);

	const showsLocal = $derived.by(() => {
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

	// one request per subject, its series cleared up front so a switch never shows
	// the previous subject's bars; a failed request silently leaves the city-wide view
	function fetchSeries(subject: ReturnType<typeof createSubjectSeries>, query: URLSearchParams) {
		const request = subject.request();
		return fetcher<Histogram>(
			apiUrl('/api/histogram', query),
			request.loaded,
			() => {},
			() => {
				request.settled();
				resetIfIdle();
			}
		);
	}

	$effect(() => {
		const bounds = inputs.cellBounds;
		const query = new URLSearchParams(inputs.params);
		if (!bounds) {
			cell.clear();
			resetIfIdle();
			return;
		}
		query.set('minLon', String(bounds.minLon));
		query.set('maxLon', String(bounds.maxLon));
		query.set('minLat', String(bounds.minLat));
		query.set('maxLat', String(bounds.maxLat));
		return fetchSeries(cell, query);
	});

	$effect(() => {
		const placeId = inputs.placeId;
		const query = new URLSearchParams(inputs.params);
		if (!placeId) {
			place.clear();
			resetIfIdle();
			return;
		}
		query.set('placeId', placeId);
		return fetchSeries(place, query);
	});

	return {
		get histogram() {
			return histogram;
		},
		/** the subject's series regardless of the switch: the markers under the city-wide bars */
		get subjectSeries() {
			return series;
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
			if (inputs.isMobile) {
				return undefined;
			}
			return toggle;
		}
	};
}
