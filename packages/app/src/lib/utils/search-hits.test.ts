import { describe, test, expect } from 'vitest';
import type { FeatureResult, ScreeningEventEntity, ManuscriptEntity } from '@atm/shared/types';
import {
	parseMarks,
	markText,
	markFeature,
	excerptSearchRanges,
	shiftRanges,
	matchWindow,
	hasSearchHits
} from './search-hits';

const S = '\u0001';
const E = '\u0002';

describe('marks', () => {
	test('a marked string is its plain text and the ranges the marks covered', () => {
		expect(parseMarks(`Nieuwe woningen aan de ${S}Zeedijk${E}`)).toEqual({
			text: 'Nieuwe woningen aan de Zeedijk',
			ranges: [{ start: 23, end: 30 }]
		});
		expect(parseMarks(`${S}Polak${E}-${S}Polak${E}`).ranges).toEqual([
			{ start: 0, end: 5 },
			{ start: 6, end: 11 }
		]);
		expect(parseMarks('plain').ranges).toEqual([]);
	});

	test('marks put back around ranges, clipped to the text', () => {
		expect(markText('Zeedijk verkooping', [{ start: 0, end: 7 }])).toBe(
			`${S}Zeedijk${E} verkooping`
		);
		expect(markText('Zeedijk', [{ start: 3, end: 20 }])).toBe(`Zee${S}dijk${E}`);
		expect(markText('ab', [])).toBe('ab');
	});
});

describe('markFeature', () => {
	const programme: ScreeningEventEntity = {
		type: 'ScreeningEvent',
		id: 'V1',
		name: 'Programma',
		startDate: '1950',
		location: {
			type: 'Place',
			name: 'Odeon',
			identifier: 'B1',
			additionalType: 'Cinema',
			address: 'Singel 460'
		},
		items: [
			{ type: 'Movie', name: 'Skippy' },
			{ type: 'Movie', name: 'De Koning van Thule' }
		]
	};
	const base = {
		id: 'f',
		label: 'Programma',
		description: 'Skippy en meer',
		recordType: 'event',
		placeId: 'p',
		entity: programme
	} as unknown as FeatureResult;

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
		const story: ManuscriptEntity = {
			type: 'Manuscript',
			name: 'Dagboek',
			excerpts: [
				{
					text: 'Eerst de brand bij de gashouder',
					truncatedBefore: false,
					truncatedAfter: false,
					mentions: []
				}
			]
		};
		const feature = {
			...base,
			entity: story,
			foundBy: [{ field: '$.excerpts[*].text', text: `Eerst de brand bij de ${S}gashouder${E}` }]
		} as unknown as FeatureResult;
		const marked = markFeature(feature);
		expect((marked.entity as ManuscriptEntity).excerpts[0].text).toBe(
			'Eerst de brand bij de gashouder'
		);
		const ranges = excerptSearchRanges(feature, story.excerpts[0]);
		expect(ranges).toEqual([{ start: 22, end: 31 }]);
		expect(shiftRanges(ranges, 15, 16)).toEqual([{ start: 7, end: 16 }]);
		expect(shiftRanges(ranges, 25, 16)).toEqual([{ start: 0, end: 6 }]); // the part of the word inside the window
		expect(shiftRanges(ranges, 35, 16)).toEqual([]);
		expect(excerptSearchRanges({ ...feature, foundBy: [] }, story.excerpts[0])).toEqual([]);
	});
});

describe('matchWindow', () => {
	test('the words around the first mark within the margin, cut with an ellipsis; unmarked, the string as it is', () => {
		const long = `Panorama van de Dam tijdens de plechtige kerkgang van koningin Wilhelmina voorafgaand aan haar Inhuldiging in de Nieuwe ${S}Kerk${E}. Op de achtergrond het Koninklijk Paleis, Dam 14`;
		expect(matchWindow(long)).toBe(`…in de Nieuwe ${S}Kerk${E}. Op de…`);
		expect(matchWindow(long, 32)).toBe(
			`…haar Inhuldiging in de Nieuwe ${S}Kerk${E}. Op de achtergrond het…`
		);
		expect(matchWindow(`Een ${S}dag${E} politiecommissaris`)).toBe(
			`Een ${S}dag${E} politiecommissaris`
		);
		expect(matchWindow('Een dag politiecommissaris')).toBe('Een dag politiecommissaris');
	});
});

describe('hasSearchHits', () => {
	test('a feature that came with hits is under a search', () => {
		const base = { id: 'f', label: 'T', recordType: 'x' } as unknown as FeatureResult;
		expect(hasSearchHits(base)).toBe(false);
		expect(hasSearchHits({ ...base, foundBy: [] })).toBe(false);
		expect(hasSearchHits({ ...base, foundBy: [{ field: 'title', text: `${S}T${E}` }] })).toBe(true);
	});
});
