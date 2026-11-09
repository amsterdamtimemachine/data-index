import { describe, test, expect } from 'vitest';
import type { Excerpt, ManuscriptEntity } from '@atm/shared/types';
import {
	pickExcerpt,
	excerptWindow,
	segmentText,
	foldSegments,
	precedingImage,
	excerptBlocks,
	wordWindow
} from './excerpts';
import { iiifImageUrl } from './iiif';

const excerpt = (over: Partial<Excerpt>): Excerpt => ({
	text: '',
	truncatedBefore: false,
	truncatedAfter: false,
	mentions: [],
	...over
});

// the window's text alone, where the test is not about its offset
const cut = (...args: Parameters<typeof excerptWindow>): Excerpt => excerptWindow(...args).excerpt;

describe('pickExcerpt', () => {
	const entity = {
		type: 'Manuscript',
		name: '',
		excerpts: [excerpt({ placeId: 'ia' }), excerpt({ placeId: 'ib' })]
	} as unknown as ManuscriptEntity;

	test('the excerpt stamped with the shown place, else the first', () => {
		expect(pickExcerpt(entity, 'ib')?.placeId).toBe('ib');
		expect(pickExcerpt(entity, 'other')?.placeId).toBe('ia');
		expect(pickExcerpt(entity)?.placeId).toBe('ia');
	});

	test('nothing without excerpts', () => {
		expect(pickExcerpt({ ...entity, excerpts: [] })).toBeNull();
	});
});

describe('excerptWindow', () => {
	const text = 'een twee drie vier vijf zes zeven acht negen tien elf twaalf';
	const place = text.indexOf('zeven');
	const ex = excerpt({ text, mentions: [{ start: place, end: place + 5 }] });

	test('a short excerpt is returned whole, at offset 0', () => {
		expect(excerptWindow(ex, 100)).toEqual({ excerpt: ex, offset: 0 });
	});

	test('a cut window says where its text starts in the whole', () => {
		const { excerpt: w, offset } = excerptWindow(ex, 24);
		expect(text.slice(offset, offset + w.text.length)).toBe(w.text);
	});

	test('cuts around the mention on word boundaries and shifts the offsets', () => {
		const w = cut(ex, 24);
		expect(w.text).toBe('vijf zes zeven acht');
		expect(w.mentions).toEqual([{ start: 9, end: 14 }]);
		expect(w.truncatedBefore).toBe(true);
		expect(w.truncatedAfter).toBe(true);
	});

	test('a given anchor takes the place of the mention: a search match, or nothing for the opening', () => {
		const tien = text.indexOf('tien');
		expect(cut(ex, 24, { start: tien, end: tien + 4 }).text).toBe('negen tien elf');
		expect(cut(ex, 24, { start: 0, end: 0 }).text).toBe('een twee drie vier vijf');
	});

	test('a window around a search match keeps the mention when it falls inside, drops it when it does not', () => {
		const acht = text.indexOf('acht');
		const inside = cut(ex, 24, { start: acht, end: acht + 4 });
		expect(inside.text).toBe('zes zeven acht negen');
		expect(inside.mentions).toEqual([{ start: 4, end: 9 }]);
		expect(cut(ex, 24, { start: 0, end: 0 }).mentions).toEqual([]);
	});

	test('a mention near the start keeps the opening and flags only the end', () => {
		const w = cut(excerpt({ text, mentions: [{ start: 0, end: 3 }] }), 14);
		expect(w.text).toBe('een twee drie');
		expect(w.truncatedBefore).toBe(false);
		expect(w.truncatedAfter).toBe(true);
	});

	test('leading whitespace is skipped without counting as a cut', () => {
		const padded = '\n\n' + text;
		const w = cut(excerpt({ text: padded, mentions: [{ start: 2, end: 5 }] }), 14);
		expect(w.text).toBe('een twee');
		expect(w.mentions).toEqual([{ start: 0, end: 3 }]);
		expect(w.truncatedBefore).toBe(false);
	});

	test('an already cut excerpt stays flagged', () => {
		const w = cut(excerpt({ text, truncatedBefore: true, mentions: [{ start: 0, end: 3 }] }), 14);
		expect(w.truncatedBefore).toBe(true);
	});
});

describe('segmentText', () => {
	test('plain and marked pieces in order', () => {
		expect(segmentText('naar de Dam en terug', { place: [{ start: 8, end: 11 }] })).toEqual([
			{ text: 'naar de ', place: false, search: false },
			{ text: 'Dam', place: true, search: false },
			{ text: ' en terug', place: false, search: false }
		]);
	});

	test('a mention at the very start, and an invalid one skipped', () => {
		expect(
			segmentText('Dam.', {
				place: [
					{ start: 0, end: 3 },
					{ start: 2, end: 9 }
				]
			})
		).toEqual([
			{ text: 'Dam', place: true, search: false },
			{ text: '.', place: false, search: false }
		]);
	});

	test('a search piece, a place piece, and a piece that is both; a search cutting through a mention splits it', () => {
		expect(
			segmentText('naar de Dam en terug', {
				place: [{ start: 8, end: 11 }],
				search: [
					{ start: 0, end: 4 },
					{ start: 8, end: 11 }
				]
			})
		).toEqual([
			{ text: 'naar', place: false, search: true },
			{ text: ' de ', place: false, search: false },
			{ text: 'Dam', place: true, search: true },
			{ text: ' en terug', place: false, search: false }
		]);
		expect(
			segmentText('Damrak', { place: [{ start: 0, end: 6 }], search: [{ start: 0, end: 3 }] })
		).toEqual([
			{ text: 'Dam', place: true, search: true },
			{ text: 'rak', place: true, search: false }
		]);
	});
});

describe('foldSegments', () => {
	test('folds each piece and keeps the spaces at the marks', () => {
		const folded = foldSegments(
			segmentText('\nenkele bruggen\nopgeblazen. Zorgvliet; allen\nniet meer\n', {
				place: [{ start: 28, end: 37 }]
			})
		);
		expect(folded).toEqual([
			{ text: 'enkele bruggen opgeblazen. ', place: false, search: false },
			{ text: 'Zorgvliet', place: true, search: false },
			{ text: '; allen niet meer', place: false, search: false }
		]);
	});
});

describe('images in the excerpt', () => {
	const img = (anchor: number) => ({
		source: 'https://iiif.example/scan.jpg',
		region: '80,806,1083,654',
		anchor
	});
	const long = 'a '.repeat(200) + 'Vondelpark ' + 'b '.repeat(200);
	const at = long.indexOf('Vondelpark');
	const mentions = [{ start: at, end: at + 10 }];

	test('the window keeps the images anchored within it, counting its edges, and shifts them', () => {
		const shown = cut(
			excerpt({ text: long, mentions, images: [img(0), img(at - 20), img(long.length)] }),
			100
		);
		const lo = long.indexOf(shown.text);
		expect(shown.images).toEqual([img(at - 20 - lo)]);
	});

	test('an image before a leading blank line still sits beside the shown text', () => {
		const text = '\nJuni 1944\nVue de mon bureau\nRozenstraat\n' + 'c '.repeat(300);
		const start = text.indexOf('Rozenstraat');
		const shown = cut(
			excerpt({ text, mentions: [{ start, end: start + 11 }], images: [img(0)] }),
			100
		);
		expect(shown.text.startsWith('Juni 1944')).toBe(true);
		expect(shown.images).toEqual([img(0)]);
	});

	test('the collapsed card takes the last image before the text', () => {
		const text = '\n\nOctober 1944\nRozenstraat\n';
		expect(precedingImage(excerpt({ text, images: [img(0), img(1), img(text.length)] }))).toEqual(
			img(1)
		);
		expect(precedingImage(excerpt({ text, images: [img(text.length)] }))).toBeNull();
		expect(precedingImage(excerpt({ text: long, images: [img(at)] }))).toBeNull();
		expect(precedingImage(excerpt({ text: 'x' }))).toBeNull();
	});

	test('the text is cut where an image sits, in reading order', () => {
		const text = 'Vondelpark, Rosarium\n29 Oct 44';
		const blocks = excerptBlocks(excerpt({ text, images: [img(21), img(0)] }));
		expect(blocks.map((b) => b.kind)).toEqual(['image', 'text', 'image', 'text']);
	});

	test('an image after the last text stays after it', () => {
		const text = '\n\nOctober 1944\nRozenstraat\n';
		const blocks = excerptBlocks(excerpt({ text, images: [img(0), img(1), img(text.length)] }));
		expect(blocks.map((b) => b.kind)).toEqual(['image', 'image', 'text', 'image']);
	});

	test('a IIIF URL asks the scan for the box at a size', () => {
		expect(iiifImageUrl(img(0), ',600')).toBe(
			'https://iiif.example/scan.jpg/80,806,1083,654/,600/0/default.jpg'
		);
		expect(iiifImageUrl(img(0))).toBe(
			'https://iiif.example/scan.jpg/80,806,1083,654/max/0/default.jpg'
		);
	});
});

describe('marks on the blocks', () => {
	test('the mentions unless given; given marks take their place', () => {
		const shown = {
			text: 'naar de Dam en terug',
			truncatedBefore: false,
			truncatedAfter: false,
			mentions: [{ start: 8, end: 11 }]
		};
		const plain = (text: string) => ({ text, place: false, search: false });
		expect(excerptBlocks(shown)).toEqual([
			{
				kind: 'text',
				segments: [
					plain('naar de '),
					{ text: 'Dam', place: true, search: false },
					plain(' en terug')
				]
			}
		]);
		expect(excerptBlocks(shown, { search: [{ start: 0, end: 4 }] })).toEqual([
			{
				kind: 'text',
				segments: [{ text: 'naar', place: false, search: true }, plain(' de Dam en terug')]
			}
		]);
	});

	test("ranges on the whole text, moved by the window's offset, land on the shown text", () => {
		const whole = {
			text: 'Eerst de brand\nbij de gashouder',
			truncatedBefore: false,
			truncatedAfter: false,
			mentions: []
		};
		const shown = { ...whole, text: 'bij de gashouder' };
		expect(excerptBlocks(shown, { search: [{ start: 22 - 15, end: 31 - 15 }] })).toEqual([
			{
				kind: 'text',
				segments: [
					{ text: 'bij de ', place: false, search: false },
					{ text: 'gashouder', place: false, search: true }
				]
			}
		]);
	});
});

describe('wordWindow', () => {
	const text = 'een twee drie vier vijf zes zeven acht negen tien elf twaalf';
	test('around a range, whole words within the margin, trimmed', () => {
		const zeven = { start: text.indexOf('zeven'), end: text.indexOf('zeven') + 5 };
		const w = wordWindow(text, zeven, 9);
		expect(text.slice(w.start, w.end)).toBe('vijf zes zeven acht');
	});
	test('a side that runs into the end hands its remainder to the other', () => {
		const twaalf = { start: text.indexOf('twaalf'), end: text.length };
		const w = wordWindow(text, twaalf, 5);
		expect(text.slice(w.start, w.end)).toBe('tien elf twaalf');
		const een = { start: 0, end: 3 };
		expect(text.slice(...(Object.values(wordWindow(text, een, 5)) as [number, number]))).toBe(
			'een twee drie'
		);
	});
});
