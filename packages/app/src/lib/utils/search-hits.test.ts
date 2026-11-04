import { describe, test, expect } from 'vitest';
import type { FeatureResult, ScreeningEventEntity, ManuscriptEntity } from '@atm/shared/types';
import { parseMarks, markText, markFeature, excerptSearchRanges, shiftRanges, hiddenHits } from './search-hits';

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

describe('hiddenHits', () => {
	const S = '\u0001';
	const E = '\u0002';
	const at = (entity: unknown, foundBy: { field: string; text: string }[], placeId = 'p') =>
		({ id: 'f', label: 'T', recordType: 'x', placeId, entity, foundBy } as unknown as FeatureResult);

	test('expanded shows everything in place: nothing listed', () => {
		const f = at({ type: 'MediaObject', name: 'Foto', author: 'Jacob Olie' }, [{ field: '$.author', text: `Jacob ${S}Olie${E}` }]);
		expect(hiddenHits(f, true)).toEqual([]);
	});

	test('a field the collapsed card leaves out is listed; one it shows is not; the title and description never are', () => {
		const photo = at({ type: 'MediaObject', name: 'Foto', author: 'Jacob Olie' }, [{ field: 'title', text: `${S}Foto${E}` }, { field: '$.author', text: `Jacob ${S}Olie${E}` }]);
		expect(hiddenHits(photo, false)).toEqual([{ label: 'Auteur', value: `Jacob ${S}Olie${E}` }]);
		const person = at({ type: 'Person', name: 'Sara', birthPlace: 'Zaandam' }, [{ field: '$.birthPlace', text: `${S}Zaandam${E}` }]);
		expect(hiddenHits(person, false)).toEqual([]);
	});

	test('a programme item is listed by its kind', () => {
		const programme = { type: 'ScreeningEvent', name: 'P', startDate: '1950', location: { type: 'Place', name: 'Odeon' }, items: [{ type: 'Movie', name: 'Skippy' }, { type: 'LiveAct', name: 'Troep' }] };
		const f = at(programme, [{ field: '$.items[*].name', text: `${S}Skippy${E}` }, { field: '$.items[*].name', text: `${S}Troep${E}` }, { field: '$.location.name', text: `${S}Odeon${E}` }]);
		expect(hiddenHits(f, false)).toEqual([{ label: 'Film', value: `${S}Skippy${E}` }, { label: 'Optreden', value: `${S}Troep${E}` }]);
	});

	test("a diary's text: a hit inside the collapsed window is not listed, one outside is, as a snippet; its description never", () => {
		const long = 'Vanmorgen vroeg. ' + 'a '.repeat(200) + 'Rozenstraat ' + 'b '.repeat(200) + 'een brand bij de gashouder in Oost.';
		const at1 = long.indexOf('Rozenstraat');
		const story = { type: 'Manuscript', name: 'D', excerpts: [{ placeId: 'p', text: long, truncatedBefore: false, truncatedAfter: false, mentions: [{ start: at1, end: at1 + 11, quote: 'Rozenstraat' }] }] };
		const gas = long.indexOf('gashouder');
		const far = at(story, [{ field: '$.excerpts[*].text', text: long.slice(0, gas) + S + 'gashouder' + E + long.slice(gas + 9) }, { field: 'description', text: `${S}Vanmorgen${E} vroeg.` }]);
		const rows = hiddenHits(far, false);
		expect(rows).toHaveLength(1);
		expect(rows[0].label).toBe('Tekst');
		expect(rows[0].value.startsWith('… ')).toBe(true);
		expect(rows[0].value).toContain(`${S}gashouder${E} in Oost.`);
		const near = at(story, [{ field: '$.excerpts[*].text', text: long.slice(0, at1) + S + 'Rozenstraat' + E + long.slice(at1 + 11) }]);
		expect(hiddenHits(near, false)).toEqual([]);
	});
});
