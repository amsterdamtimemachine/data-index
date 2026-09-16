/**
 * The timeline scope: which series the band shows and when. Desktop needs the
 * switch, mobile follows the open modal or panel; the place wins over the cell;
 * a loading subject shows the empty band; losing the last subject resets the
 * switch; a stale request cannot clear the loading state.
 */
import { describe, test, expect } from 'vitest';
import type { Histogram } from '@atm/shared/types';
import { createTimelineScope, type TimelineScopeInputs } from './timeline-scope.svelte';

function series(count: number): Histogram {
	return {
		bins: [{
			timeSlice: { key: '1900_1950', label: '1900-1950', timeRange: { start: '1900', end: '1950' }, startYear: 1900, endYear: 1950, durationYears: 50 },
			count
		}],
		maxCount: count,
		timeRange: { start: '1900', end: '1950' },
		totalFeatures: count
	};
}

function scope(overrides: Partial<TimelineScopeInputs> = {}) {
	const inputs = $state<TimelineScopeInputs>({
		isMobile: false,
		cellModalOpen: false,
		placePanelOpen: false,
		placeTitle: null,
		...overrides
	});
	return { inputs, scope: createTimelineScope(() => inputs) };
}

describe('timeline scope', () => {
	test('without a subject the band is city-wide and the switch has nothing to show', () => {
		const { scope: s } = scope();
		expect(s.histogram).toBeNull();
		expect(s.available).toBe(false);
		expect(s.subjectSeries).toBeNull();
		expect(s.onToggle).toBeDefined();
	});

	test("desktop: a loaded cell series waits for the switch, but is there for the markers", () => {
		const { scope: s } = scope();
		const request = s.cellRequest();
		request.loaded(series(3));
		request.settled();
		s.requestSettled();
		expect(s.histogram).toBeNull();
		expect(s.subjectSeries?.totalFeatures).toBe(3);
		expect(s.available).toBe(true);
		s.onToggle!();
		expect(s.switchOn).toBe(true);
		expect(s.histogram?.totalFeatures).toBe(3);
		s.onToggle!();
		expect(s.histogram).toBeNull();
	});

	test('while the subject loads, the switched-on band is empty rather than city-wide', () => {
		const { scope: s } = scope();
		s.onToggle!();
		const request = s.cellRequest();
		expect(s.available).toBe(true);
		expect(s.histogram?.bins).toEqual([]);
		request.loaded(series(2));
		request.settled();
		expect(s.histogram?.totalFeatures).toBe(2);
	});

	test('an open place panel shows the place series and names it', () => {
		const { scope: s } = scope({ placePanelOpen: true, placeTitle: 'Dam' });
		const cell = s.cellRequest();
		cell.loaded(series(1));
		cell.settled();
		const place = s.placeRequest();
		place.loaded(series(5));
		place.settled();
		s.onToggle!();
		expect(s.histogram?.totalFeatures).toBe(5);
		expect(s.label).toBe('Tijdlijn van Dam');
	});

	test('losing the last subject turns the switch off', () => {
		const { scope: s } = scope();
		const request = s.cellRequest();
		request.loaded(series(1));
		request.settled();
		s.onToggle!();
		expect(s.switchOn).toBe(true);
		s.clearCell();
		expect(s.switchOn).toBe(false);
		expect(s.available).toBe(false);
	});

	test('mobile: the open modal decides, and there is no switch', () => {
		const { inputs, scope: s } = scope({ isMobile: true });
		expect(s.onToggle).toBeUndefined();
		const request = s.cellRequest();
		request.loaded(series(4));
		request.settled();
		expect(s.histogram).toBeNull();
		inputs.cellModalOpen = true;
		expect(s.histogram?.totalFeatures).toBe(4);
	});

	test('a stale request settling after its successor does not end the loading state', () => {
		const { scope: s } = scope();
		s.onToggle!();
		const first = s.cellRequest();
		const second = s.cellRequest();
		first.settled();
		expect(s.available).toBe(true);
		expect(s.histogram?.bins).toEqual([]);
		second.loaded(series(1));
		second.settled();
		expect(s.histogram?.totalFeatures).toBe(1);
	});
});
