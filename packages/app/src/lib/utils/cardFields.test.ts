import { describe, test, expect } from 'vitest';
import type { ScreeningEventEntity, TheaterEventEntity, FeatureResult } from '@atm/shared/types';
import { resolveCardFields, dataSourceFields, programmeBillRows, programmeBillHeading, entitySubtype, relationLine, typeLabel } from './cardFields';

const screening: ScreeningEventEntity = {
	type: 'ScreeningEvent',
	id: 'V1',
	name: 'Skippy (1931)',
	startDate: '1934-01-05',
	location: { type: 'Place', name: 'Rialto', identifier: 'B1', additionalType: 'Cinema', address: 'Ceintuurbaan 338' },
	bill: [
		{ type: 'Movie', name: 'Skippy (1931)', url: 'https://cinemacontext.nl/id/F1' },
		{ type: 'LiveAct', name: 'Mello Wendini, komisch dressuur act' },
		{ type: 'Movie', name: 'Reis naar de maan, De' }
	]
};

const theatre: TheaterEventEntity = {
	type: 'TheaterEvent',
	name: 'Allison Troep, acrobaten',
	startDate: '1907-05',
	location: { type: 'Place', name: 'Carr', identifier: 'B2' },
	bill: [{ type: 'LiveAct', name: 'Allison Troep, acrobaten' }]
};

describe('programme cards', () => {
	test('collapsed: the venue', () => {
		expect(resolveCardFields(screening, false)).toEqual([{ label: 'Venue', value: 'Rialto', href: undefined }]);
	});

	test('expanded adds nothing beyond the venue: the bill is the card content', () => {
		expect(resolveCardFields(screening, true).length).toBe(1);
		expect(resolveCardFields(theatre, true).length).toBe(1);
	});

	test('a bill of several items gets a heading worded from it; one item gets none', () => {
		expect(programmeBillHeading(screening)).toBe('2 films en 1 optreden op het programma');
		expect(programmeBillHeading({ ...theatre, bill: [{ type: 'LiveAct', name: 'a' }, { type: 'LiveAct', name: 'b' }] })).toBe('2 optredens op het programma');
		expect(programmeBillHeading(theatre)).toBeNull();
		expect(programmeBillHeading({ type: 'Person', name: 'x' })).toBeNull();
	});

	test("the bill in the source's order: a film linked where it has a page, an act as worded", () => {
		expect(programmeBillRows(screening)).toEqual([
			{ label: 'Film', value: 'Skippy (1931)', href: 'https://cinemacontext.nl/id/F1' },
			{ label: 'Optreden', value: 'Mello Wendini, komisch dressuur act' },
			{ label: 'Film', value: 'Reis naar de maan, De', href: undefined }
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
			{ label: 'Geboren', value: '1 januari 1900', href: undefined },
			{ label: 'Overleden', value: 'Onbekend', href: undefined }
		]);
	});
});

describe('relationLine', () => {
	const base = {
		id: 'f', recordType: 'event', label: 'x', dateRange: [1934, 1934], tags: [], classifiers: [], spatialFrequency: 1,
		relationId: 'screenedAt', displayName: 'Ceintuurbaan 338', placeUrl: 'https://adamlink.nl/geo/address/A1',
		startDate: '1934-01-05', endDate: '1934-01-05', entity: screening
	} as FeatureResult;

	test('the type, the relation, the place linked to its record, and the date of a dated relation', () => {
		expect(relationLine({ ...base, relationDated: true })).toEqual({
			type: 'Filmvertoning',
			relation: 'Vertoond op',
			place: 'Ceintuurbaan 338',
			placeHref: 'https://adamlink.nl/geo/address/A1',
			date: ', 5 januari 1934'
		});
	});

	test('an undated relation has no date; an old name carries today\'s after it', () => {
		const text = { ...base, recordType: 'text', entity: undefined, relationId: 'isAbout', relationDated: false, historicalLabel: 'Plaetse', displayName: 'Dam' } as FeatureResult;
		expect(relationLine(text)).toEqual({
			type: 'Tekst', relation: 'Gaat over', place: 'Plaetse', placeHref: 'https://adamlink.nl/geo/address/A1', now: ' (nu Dam)'
		});
	});

	test('the type is the most specific one: the subtype where there is one', () => {
		expect(typeLabel(base)).toBe('Filmvertoning');
		expect(typeLabel({ ...base, entity: theatre } as FeatureResult)).toBe('Voorstelling');
		expect(typeLabel({ ...base, recordType: 'image', entity: undefined } as FeatureResult)).toBe('Afbeelding');
	});
});

describe('provenance rows', () => {
	const beeldbank = {
		id: 'f', recordType: 'image', label: 'x', dateRange: [1900, 1900], tags: ['maps'], spatialFrequency: 1,
		url: 'https://id.archief.amsterdam/f', providerLabel: 'Amsterdam Stadsarchief', providerUrl: 'https://archief.amsterdam', datasetLabel: 'Beeldbank',
		placeType: 'street', displayName: 'Keizersgracht', placeUrl: 'https://adamlink.nl/geo/street/keizersgracht/2337',
		placeProviderLabel: 'Adamlink', placeProviderUrl: 'https://adamlink.nl',
		geometryProviderLabel: 'NWB', geometryProviderUrl: 'https://www.rijkswaterstaat.nl',
		classifiers: [{ id: 'siglip2', label: 'SigLIP 2', url: 'https://example.org/siglip' }]
	} as FeatureResult;

	test('provenance: a provider when it is someone else than the dataset, the model, and the leveranciers', () => {
		expect(dataSourceFields(beeldbank, true).map((r) => [r.label, r.value, r.href])).toEqual([
			['Dataleverancier', 'Amsterdam Stadsarchief', 'https://archief.amsterdam'],
			['Locatieleverancier', 'Adamlink', 'https://adamlink.nl'],
			['Geometrieleverancier', 'NWB', 'https://www.rijkswaterstaat.nl'],
			['Classificatiemodel', 'SigLIP 2', 'https://example.org/siglip']
		]);
		const own = { ...beeldbank, providerLabel: 'Cinema Context', datasetLabel: 'Cinema Context', classifiers: [], geometryProviderLabel: undefined };
		expect(dataSourceFields(own, true).map((r) => r.label)).toEqual(['Locatieleverancier']);
		expect(dataSourceFields(beeldbank, false)).toEqual([]);
	});

	test('a public download of the whole dataset is a row between the leveranciers and the model', () => {
		const diaries = { ...beeldbank, datasetLabel: 'Amsterdam Diaries Time Machine', datasetDistributionUrl: 'https://zenodo.org/records/14385058' } as FeatureResult;
		expect(dataSourceFields(diaries, true).map((r) => r.label)).toEqual(['Dataleverancier', 'Locatieleverancier', 'Geometrieleverancier', 'Volledige dataset', 'Classificatiemodel']);
		expect(dataSourceFields(diaries, true)[3]).toEqual({ label: 'Volledige dataset', value: 'zenodo.org', href: 'https://zenodo.org/records/14385058' });
	});

	test('an image shows the archive\'s own dating, else its dates worded at their precision', () => {
		const image = { type: 'MediaObject' as const, name: 'x', contentUrl: 'u' };
		expect(resolveCardFields({ ...image, dateText: '1953 (ca.) t/m 1995 (ca.)', dateCreated: '1953-01-01/1995-12-31' }, true)[0])
			.toEqual({ label: 'Datering', value: '1953 (ca.) t/m 1995 (ca.)', href: undefined });
		expect(resolveCardFields({ ...image, dateCreated: '1988-01-01/1988-12-31' }, true)[0].value).toBe('1988');
		expect(resolveCardFields({ ...image, dateCreated: '1958-09-27' }, true)[0].value).toBe('27 september 1958');
	});

	test('a story shows when it was written, at the precision it was dated', () => {
		const entry = { type: 'Manuscript' as const, name: 'x', excerpts: [] };
		expect(resolveCardFields({ ...entry, dateCreated: '1944-10-30' }, true)[0]).toEqual({ label: 'Geschreven', value: '30 oktober 1944', href: undefined });
		expect(resolveCardFields({ ...entry, dateCreated: '1943-01' }, true)[0].value).toBe('januari 1943');
		expect(resolveCardFields(entry, true).find((r) => r.label === 'Geschreven')).toBeUndefined();
	});

	test('a text shows the issue it appeared in', () => {
		expect(resolveCardFields({ type: 'CreativeWork', name: 'x', datePublished: '1967-01-03' }, true)).toEqual([
			{ label: 'Gepubliceerd', value: '3 januari 1967', href: undefined }
		]);
	});
});
