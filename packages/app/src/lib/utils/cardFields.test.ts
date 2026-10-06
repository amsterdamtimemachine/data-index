import { describe, test, expect } from 'vitest';
import type { GroupFeature, EventSeriesEntity } from '@atm/shared/types';
import { groupMemberRows, entityKind, seriesMemberCount, resolveCardFields } from './cardFields';

const programme: GroupFeature = {
	id: 'a',
	url: 'https://cinemacontext.nl/id/V1',
	label: 'Rialto',
	startDate: '1934-01-05',
	endDate: '1934-01-05',
	entity: {
		type: 'ScreeningEvent',
		name: 'Rialto',
		alternateName: 'jeugdbioscoop',
		startDate: '1934-01-05',
		location: { type: 'MovieTheater', name: 'Rialto', identifier: 'B1' },
		workPresented: [
			{ type: 'Movie', name: 'Skippy (1931)', url: 'https://cinemacontext.nl/id/F1' },
			{ type: 'Movie', name: 'Reis naar de maan, De' }
		],
		performer: 'Dumas, humorist'
	}
};

const series: EventSeriesEntity = {
	type: 'EventSeries',
	name: 'Rialto',
	location: { type: 'MovieTheater', name: 'Rialto', identifier: 'B1', url: 'https://cinemacontext.nl/id/B1' },
	startDate: '1934-01-05',
	endDate: '1960-03-04',
	years: [{ year: 1934, count: 3 }, { year: 1960, count: 1 }]
};

describe('groupMemberRows', () => {
	test('a programme is its linked date beside its first film, the rest of the bill under it', () => {
		expect(groupMemberRows([programme])).toEqual([
			{ label: '5 januari', labelHref: programme.url, value: 'Skippy (1931)', href: 'https://cinemacontext.nl/id/F1' },
			{ label: '', value: 'Reis naar de maan, De', href: undefined },
			{ label: '', value: 'Dumas, humorist', muted: true }
		]);
	});

	test('a programme without a page has no label link; without a bill it is its date alone', () => {
		const bare: GroupFeature = {
			...programme,
			url: undefined,
			entity: { ...programme.entity!, type: 'ScreeningEvent', startDate: '1907-05', workPresented: [], performer: undefined } as GroupFeature['entity']
		};
		expect(groupMemberRows([bare])).toEqual([{ label: 'mei', labelHref: undefined, value: '' }]);
	});
});

describe('EventSeries fields', () => {
	test('the collapsed card shows the venue under its kind, linked, then what it holds over the period', () => {
		expect(seriesMemberCount(series)).toBe(4);
		expect(resolveCardFields(series, false)).toEqual([
			{ label: 'Bioscoop', value: 'Rialto', href: 'https://cinemacontext.nl/id/B1' },
			{ label: 'Vertoningen', value: '4' }
		]);
	});

	test('the words follow the venue kind: a theatre holds performances, the catch-all events', () => {
		const theatre: EventSeriesEntity = { ...series, location: { type: 'PerformingArtsTheater', name: 'Carré', identifier: 'B2' } };
		expect(resolveCardFields(theatre, false)).toEqual([
			{ label: 'Theater', value: 'Carré', href: undefined },
			{ label: 'Voorstellingen', value: '4' }
		]);
		const hall: EventSeriesEntity = { ...series, location: { type: 'EventVenue', name: 'Carr', identifier: 'B3' } };
		expect(resolveCardFields(hall, false)).toEqual([
			{ label: 'Locatie', value: 'Carr', href: undefined },
			{ label: 'Evenementen', value: '4' }
		]);
	});

	test('labels reach the list as text', () => {
		expect(resolveCardFields({ type: 'Person', name: 'x', birthDate: '1900-01-01' }, false)).toEqual([
			{ label: 'Geboren', value: '01. 01. 1900', href: undefined },
			{ label: 'Overleden', value: 'Onbekend', href: undefined }
		]);
	});
});

describe('entityKind', () => {
	test('an event names its venue kind; other entities none', () => {
		expect(entityKind(programme.entity)).toBe('MovieTheater');
		expect(entityKind({ type: 'Person', name: 'x' })).toBeNull();
		expect(entityKind(undefined)).toBeNull();
	});
});
