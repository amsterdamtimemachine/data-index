import { describe, test, expect } from 'vitest';
import type { ScreeningEventEntity, TheaterEventEntity, FeatureResult } from '@atm/shared/types';
import { resolveCardFields, dataSourceFields, identityFields, programmeBillRows, programmeBillHeading, entitySubtype, relationLine } from './cardFields';

const screening: ScreeningEventEntity = {
	type: 'ScreeningEvent',
	id: 'V1',
	name: 'Mello Wendini, komisch dressuur act',
	startDate: '1934-01-05',
	location: { type: 'Place', name: 'Rialto', identifier: 'B1', additionalType: 'Cinema', address: 'Ceintuurbaan 338' },
	workPresented: [
		{ type: 'Movie', name: 'Skippy (1931)', url: 'https://cinemacontext.nl/id/F1' },
		{ type: 'Movie', name: 'Reis naar de maan, De' }
	],
	performer: ['Mello Wendini, komisch dressuur act'],
	citation: ['Telegraaf', 'Het Parool']
};

const theatre: TheaterEventEntity = {
	type: 'TheaterEvent',
	name: 'Allison Troep, acrobaten',
	startDate: '1907-05',
	location: { type: 'Place', name: 'Carr', identifier: 'B2' },
	workPresented: [],
	performer: ['Allison Troep, acrobaten']
};

describe('programme cards', () => {
	test('collapsed: the venue', () => {
		expect(resolveCardFields(screening, false)).toEqual([{ label: 'Venue', value: 'Rialto', href: undefined }]);
	});

	test('expanded adds the newspapers the programme was listed in', () => {
		expect(resolveCardFields(screening, true)[1]).toEqual({ label: 'Programmabron', value: 'Telegraaf, Het Parool', href: undefined });
		expect(resolveCardFields(theatre, true).length).toBe(1);
	});

	test('a bill of several items gets a heading worded from it; one item gets none', () => {
		expect(programmeBillHeading(screening)).toBe('2 films en 1 optreden op het programma');
		expect(programmeBillHeading({ ...theatre, performer: ['a', 'b'] })).toBe('2 optredens op het programma');
		expect(programmeBillHeading(theatre)).toBeNull();
		expect(programmeBillHeading({ type: 'Person', name: 'x' })).toBeNull();
	});

	test('the bill: every film linked where it has a page, then every act', () => {
		expect(programmeBillRows(screening)).toEqual([
			{ label: 'Film', value: 'Skippy (1931)', href: 'https://cinemacontext.nl/id/F1' },
			{ label: 'Film', value: 'Reis naar de maan, De', href: undefined },
			{ label: 'Optreden', value: 'Mello Wendini, komisch dressuur act' }
		]);
		expect(programmeBillRows({ type: 'Person', name: 'x' })).toEqual([]);
		expect(programmeBillRows(undefined)).toEqual([]);
	});

	test('the subtype follows the type: a screening or a performance', () => {
		expect(entitySubtype(screening)).toBe('screening');
		expect(entitySubtype(theatre)).toBe('performance');
		expect(entitySubtype({ type: 'Person', name: 'x' })).toBeNull();
	});

	test('labels reach the list as text', () => {
		expect(resolveCardFields({ type: 'Person', name: 'x', birthDate: '1900-01-01' }, false)).toEqual([
			{ label: 'Geboren', value: '01. 01. 1900', href: undefined },
			{ label: 'Overleden', value: 'Onbekend', href: undefined }
		]);
	});
});

describe('relationLine', () => {
	const base = {
		id: 'f', recordType: 'event', label: 'x', dateRange: [1934, 1934], tags: [], classifiers: [], spatialFrequency: 1, temporalFrequency: 1,
		relationId: 'screenedAt', displayName: 'Ceintuurbaan 338', startDate: '1934-01-05', endDate: '1934-01-05'
	} as FeatureResult;

	test('a dated relation carries the date at its precision', () => {
		expect(relationLine({ ...base, relationDated: true })).toBe('Vertoond op Ceintuurbaan 338, 5 januari 1934');
		expect(relationLine({ ...base, relationDated: true, startDate: '1907-05-01', endDate: '1907-05-31' })).toBe('Vertoond op Ceintuurbaan 338, mei 1907');
	});

	test('an undated relation names the place only, with its current name when it changed', () => {
		expect(relationLine({ ...base, relationId: 'isAbout', relationDated: false })).toBe('Gaat over Ceintuurbaan 338');
		expect(relationLine({ ...base, relationId: 'isAbout', historicalLabel: 'Plaetse', displayName: 'Dam' })).toBe('Gaat over Plaetse (nu Dam)');
	});
});

describe('expanded rows: what and where, then the sources', () => {
	const beeldbank = {
		id: 'f', recordType: 'image', label: 'x', dateRange: [1900, 1900], tags: ['maps'], spatialFrequency: 1, temporalFrequency: 1,
		url: 'https://id.archief.amsterdam/f', providerLabel: 'Amsterdam Stadsarchief', providerUrl: 'https://archief.amsterdam', datasetLabel: 'Beeldbank',
		placeType: 'street', displayName: 'Keizersgracht', placeUrl: 'https://adamlink.nl/geo/street/keizersgracht/2337',
		placeProviderLabel: 'Adamlink', placeProviderUrl: 'https://adamlink.nl',
		geometryProviderLabel: 'NWB', geometryProviderUrl: 'https://www.rijkswaterstaat.nl',
		classifiers: [{ id: 'siglip2', label: 'SigLIP 2', url: 'https://example.org/siglip' }]
	} as FeatureResult;

	test('the type, then the place labelled by its type and linked to its record', () => {
		expect(identityFields(beeldbank).map((r) => [r.label, r.value, r.href])).toEqual([
			['Type', 'Afbeelding', undefined],
			['Straat', 'Keizersgracht', 'https://adamlink.nl/geo/street/keizersgracht/2337']
		]);
		const renamed = { ...beeldbank, historicalLabel: 'Keizersgragt', displayName: 'Keizersgracht' } as FeatureResult;
		expect(identityFields(renamed)[1].value).toBe('Keizersgragt (nu Keizersgracht)');
		const event = { ...beeldbank, recordType: 'event', entity: screening } as FeatureResult;
		expect(identityFields(event)[0].value).toBe('Evenement, vertoning');
	});

	test('Bron links the record; a provider shows when it is someone else; the leveranciers link their pages', () => {
		expect(dataSourceFields(beeldbank, true).map((r) => [r.label, r.value, r.href])).toEqual([
			['Bron', 'Beeldbank', 'https://id.archief.amsterdam/f'],
			['Dataleverancier', 'Amsterdam Stadsarchief', 'https://archief.amsterdam'],
			['Classificatiemodel', 'SigLIP 2', 'https://example.org/siglip'],
			['Locatieleverancier', 'Adamlink', 'https://adamlink.nl'],
			['Geometrieleverancier', 'NWB', 'https://www.rijkswaterstaat.nl']
		]);
		const own = { ...beeldbank, providerLabel: 'Cinema Context', datasetLabel: 'Cinema Context', classifiers: [], geometryProviderLabel: undefined };
		expect(dataSourceFields(own, true).map((r) => r.label)).toEqual(['Bron', 'Locatieleverancier']);
		expect(dataSourceFields(beeldbank, false)).toEqual([]);
	});

	test('an image shows the archive\'s own dating, else its dates worded at their precision', () => {
		const image = { type: 'MediaObject' as const, name: 'x', contentUrl: 'u' };
		expect(resolveCardFields({ ...image, dateText: '1953 (ca.) t/m 1995 (ca.)', dateCreated: '1953-01-01/1995-12-31' }, true)[0])
			.toEqual({ label: 'Datering', value: '1953 (ca.) t/m 1995 (ca.)', href: undefined });
		expect(resolveCardFields({ ...image, dateCreated: '1988-01-01/1988-12-31' }, true)[0].value).toBe('1988');
		expect(resolveCardFields({ ...image, dateCreated: '1958-09-27' }, true)[0].value).toBe('27 september 1958');
	});

	test('a text shows the issue it appeared in', () => {
		expect(resolveCardFields({ type: 'CreativeWork', name: 'x', dateCreated: '1967-01-03' }, true)).toEqual([
			{ label: 'Gepubliceerd', value: '3 januari 1967', href: undefined }
		]);
	});
});
