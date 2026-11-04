import { describe, test, expect } from 'vitest';
import type { FeatureResult, ScreeningEventEntity, ManuscriptEntity } from '@atm/shared/types';
import { parseMarks, markText, markFeature, excerptSearchRanges, shiftRanges, foundByRows } from './search-hits';

const S = '\u0001';
const E = '\u0002';

describe('marks', () => {
	test('a marked string is its plain text and the ranges the marks covered', () => {
		expect(parseMarks(`Nieuwe woningen aan de ${S}Zeedijk${E}`)).toEqual({ text: 'Nieuwe woningen aan de Zeedijk', ranges: [{ start: 23, end: 30 }] });
		expect(parseMarks(`${S}Polak${E}-${S}Polak${E}`).ranges).toEqual([{ start: 0, end: 5 }, { start: 6, end: 11 }]);
		expect(parseMarks('plain').ranges).toEqual([]);
	});

	test('marks put back around ranges, clipped to the text', () => {
		expect(markText('Zeedijk verkooping', [{ start: 0, end: 7 }])).toBe(`${S}Zeedijk${E} verkooping`);
		expect(markText('Zeedijk', [{ start: 3, end: 20 }])).toBe(`Zee${S}dijk${E}`);
		expect(markText('ab', [])).toBe('ab');
	});
});

describe('markFeature', () => {
	const programme: ScreeningEventEntity = {
		type: 'ScreeningEvent', id: 'V1', name: 'Programma', startDate: '1950',
		location: { type: 'Place', name: 'Odeon', identifier: 'B1', additionalType: 'Cinema', address: 'Singel 460' },
		items: [{ type: 'Movie', name: 'Skippy' }, { type: 'Movie', name: 'De Koning van Thule' }]
	};
	const base = { id: 'f', label: 'Programma', description: 'Skippy en meer', recordType: 'event', placeId: 'p', entity: programme } as unknown as FeatureResult;

	test('without hits the feature is returned as it is', () => {
		expect(markFeature(base)).toBe(base);
	});

	test('the title, the description and the entity fields the hits name are marked; the rest and the original untouched', () => {
		const hits = [
			{ field: 'title', text: `${S}Programma${E}` },
			{ field: 'description', text: `${S}Skippy${E} en meer` },
			{ field: '$.location.name', text: `${S}Odeon${E}` },
			{ field: '$.items[*].name', text: `De ${S}Koning${E} van Thule` }
		];
		const marked = markFeature({ ...base, foundBy: hits });
		expect(marked.label).toBe(`${S}Programma${E}`);
		expect(marked.description).toBe(`${S}Skippy${E} en meer`);
		const entity = marked.entity as ScreeningEventEntity;
		expect(entity.location.name).toBe(`${S}Odeon${E}`);
		expect(entity.items.map((i) => i.name)).toEqual(['Skippy', `De ${S}Koning${E} van Thule`]);
		expect(programme.location.name).toBe('Odeon');
		expect(base.label).toBe('Programma');
	});

	test("a diary's excerpt text is not marked in place; its ranges come separately, moved onto a window", () => {
		const story: ManuscriptEntity = { type: 'Manuscript', name: 'Dagboek', excerpts: [{ text: 'Eerst de brand bij de gashouder', truncatedBefore: false, truncatedAfter: false, mentions: [] }] };
		const feature = { ...base, entity: story, foundBy: [{ field: '$.excerpts[*].text', text: `Eerst de brand bij de ${S}gashouder${E}` }] } as unknown as FeatureResult;
		const marked = markFeature(feature);
		expect((marked.entity as ManuscriptEntity).excerpts[0].text).toBe('Eerst de brand bij de gashouder');
		const ranges = excerptSearchRanges(feature, story.excerpts[0]);
		expect(ranges).toEqual([{ start: 22, end: 31 }]);
		expect(shiftRanges(ranges, 15, 16)).toEqual([{ start: 7, end: 16 }]);
		expect(shiftRanges(ranges, 25, 16)).toEqual([{ start: 0, end: 6 }]); // the part of the word inside the window
		expect(shiftRanges(ranges, 35, 16)).toEqual([]);
		expect(excerptSearchRanges({ ...feature, foundBy: [] }, story.excerpts[0])).toEqual([]);
	});
});

describe('foundByRows', () => {
	const S = '\u0001';
	const E = '\u0002';
	const at = (entity: unknown, foundBy: { field: string; text: string }[], placeId = 'p') =>
		({ id: 'f', label: 'T', recordType: 'x', placeId, entity, foundBy } as unknown as FeatureResult);

	test('expanded shows everything in place: nothing listed', () => {
		const f = at({ type: 'MediaObject', name: 'Foto', author: 'Jacob Olie' }, [{ field: '$.author', text: `Jacob ${S}Olie${E}` }]);
		expect(foundByRows(f, true)).toEqual([]);
	});

	test('collapsed, every match is a row: the title as a snippet, a field by its label, whether shown or not', () => {
		const photo = at({ type: 'MediaObject', name: 'Foto', author: 'Jacob Olie' }, [{ field: 'title', text: `${S}Foto${E} van Olie` }, { field: '$.author', text: `Jacob ${S}Olie${E}` }]);
		expect(foundByRows(photo, false)).toEqual([{ label: 'Titel', value: `${S}Foto${E} van Olie` }, { label: 'Auteur', value: `Jacob ${S}Olie${E}` }]);
		const long = `Panorama van de Dam tijdens de plechtige kerkgang van koningin Wilhelmina voorafgaand aan haar Inhuldiging in de Nieuwe ${S}Kerk${E}. Op de achtergrond het Koninklijk Paleis, Dam 14`;
		expect(foundByRows(at({ type: 'MediaObject', name: 'P' }, [{ field: 'title', text: long }]), false)).toEqual([{ label: 'Titel', value: `…haar Inhuldiging in de Nieuwe ${S}Kerk${E}. Op de achtergrond het…` }]);
		const person = at({ type: 'Person', name: 'Sara', birthPlace: 'Zaandam' }, [{ field: '$.birthPlace', text: `${S}Zaandam${E}` }]);
		expect(foundByRows(person, false)).toEqual([{ label: 'Geboren', value: `${S}Zaandam${E}` }]);
	});

	test('a programme item is listed by its kind, the venue by its label', () => {
		const programme = { type: 'ScreeningEvent', name: 'P', startDate: '1950', location: { type: 'Place', name: 'Odeon' }, items: [{ type: 'Movie', name: 'Skippy' }, { type: 'LiveAct', name: 'Troep' }] };
		const f = at(programme, [{ field: '$.items[*].name', text: `${S}Skippy${E}` }, { field: '$.items[*].name', text: `${S}Troep${E}` }, { field: '$.location.name', text: `${S}Odeon${E}` }]);
		expect(foundByRows(f, false)).toEqual([{ label: 'Film', value: `${S}Skippy${E}` }, { label: 'Optreden', value: `${S}Troep${E}` }, { label: 'Venue', value: `${S}Odeon${E}` }]);
	});

	test('a description and a diary text are snippets around the match, cut with an ellipsis; a diary description is left out', () => {
		const text = at({ type: 'CreativeWork', name: 'A' }, [{ field: 'description', text: `${'woord '.repeat(12)}de ${S}brand${E} in Oost ${'woord '.repeat(12)}` }]);
		// at most 32 characters either side, whole words only, an ellipsis where cut
		const [row] = foundByRows(text, false);
		expect(row.label).toBe('Beschrijving');
		expect(row.value).toBe(`…woord woord woord woord de ${S}brand${E} in Oost woord woord woord woord…`);
		const short = at({ type: 'CreativeWork', name: 'A' }, [{ field: 'description', text: `de ${S}brand${E}` }]);
		expect(foundByRows(short, false)).toEqual([{ label: 'Beschrijving', value: `de ${S}brand${E}` }]);
		const story = { type: 'Manuscript', name: 'D', excerpts: [{ placeId: 'p', text: 'Eerst de brand bij de gashouder in Oost', truncatedBefore: false, truncatedAfter: false, mentions: [] }] };
		const diary = at(story, [{ field: '$.excerpts[*].text', text: `Eerst de brand bij de ${S}gashouder${E} in Oost` }, { field: 'description', text: `Eerst de ${S}brand${E}` }]);
		expect(foundByRows(diary, false)).toEqual([{ label: 'Tekst', value: `Eerst de brand bij de ${S}gashouder${E} in Oost` }]);
	});
});
