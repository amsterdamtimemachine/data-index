import { describe, test, expect } from 'vitest';
import type { Excerpt, ManuscriptEntity } from '@atm/shared/types';
import { pickExcerpt, excerptWindow, segmentText, foldSegments, nearestImage, excerptBlocks } from './excerpts';
import { iiifImageUrl } from './iiif';

const excerpt = (over: Partial<Excerpt>): Excerpt => ({
	text: '',
	truncatedBefore: false,
	truncatedAfter: false,
	mentions: [],
	...over
});

describe('pickExcerpt', () => {
	const entity = { type: 'Manuscript', name: '', excerpts: [excerpt({ placeId: 'ia' }), excerpt({ placeId: 'ib' })] } as unknown as ManuscriptEntity;

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
	const ex = excerpt({ text, mentions: [{ start: place, end: place + 5, quote: 'zeven' }] });

	test('a short excerpt is returned whole', () => {
		expect(excerptWindow(ex, 100)).toBe(ex);
	});

	test('cuts around the mention on word boundaries and shifts the offsets', () => {
		const w = excerptWindow(ex, 24);
		expect(w.text).toBe('vijf zes zeven acht');
		expect(w.mentions).toEqual([{ start: 9, end: 14, quote: 'zeven' }]);
		expect(w.truncatedBefore).toBe(true);
		expect(w.truncatedAfter).toBe(true);
	});

	test('a mention near the start keeps the opening and flags only the end', () => {
		const w = excerptWindow(excerpt({ text, mentions: [{ start: 0, end: 3, quote: 'een' }] }), 14);
		expect(w.text).toBe('een twee drie');
		expect(w.truncatedBefore).toBe(false);
		expect(w.truncatedAfter).toBe(true);
	});

	test('leading whitespace is skipped without counting as a cut', () => {
		const padded = '\n\n' + text;
		const w = excerptWindow(excerpt({ text: padded, mentions: [{ start: 2, end: 5, quote: 'een' }] }), 14);
		expect(w.text).toBe('een twee');
		expect(w.mentions).toEqual([{ start: 0, end: 3, quote: 'een' }]);
		expect(w.truncatedBefore).toBe(false);
	});

	test('an already cut excerpt stays flagged', () => {
		const w = excerptWindow(excerpt({ text, truncatedBefore: true, mentions: [{ start: 0, end: 3, quote: 'een' }] }), 14);
		expect(w.truncatedBefore).toBe(true);
	});
});

describe('segmentText', () => {
	test('plain and marked pieces in order', () => {
		expect(segmentText('naar de Dam en terug', [{ start: 8, end: 11, quote: 'Dam' }])).toEqual([
			{ text: 'naar de ', marked: false },
			{ text: 'Dam', marked: true },
			{ text: ' en terug', marked: false }
		]);
	});

	test('a mention at the very start, and an invalid one skipped', () => {
		expect(segmentText('Dam.', [{ start: 0, end: 3, quote: 'Dam' }, { start: 2, end: 9, quote: 'x' }])).toEqual([
			{ text: 'Dam', marked: true },
			{ text: '.', marked: false }
		]);
	});
});

describe('foldSegments', () => {
	test('folds each piece and keeps the spaces at the marks', () => {
		const folded = foldSegments(segmentText('\nenkele bruggen\nopgeblazen. Zorgvliet; allen\nniet meer\n', [{ start: 28, end: 37, quote: 'Zorgvliet' }]));
		expect(folded).toEqual([
			{ text: 'enkele bruggen opgeblazen. ', marked: false },
			{ text: 'Zorgvliet', marked: true },
			{ text: '; allen niet meer', marked: false }
		]);
	});
});

describe('images in the excerpt', () => {
	const img = (anchor: number) => ({ source: 'https://iiif.example/scan.jpg', region: '80,806,1083,654', anchor });
	const long = 'a '.repeat(200) + 'Vondelpark ' + 'b '.repeat(200);
	const at = long.indexOf('Vondelpark');
	const mentions = [{ start: at, end: at + 10, quote: 'Vondelpark' }];

	test('the window keeps the images anchored within it, counting its edges, and shifts them', () => {
		const shown = excerptWindow(excerpt({ text: long, mentions, images: [img(0), img(at - 20), img(long.length)] }), 100);
		const lo = long.indexOf(shown.text);
		expect(shown.images).toEqual([img(at - 20 - lo)]);
	});

	test('an image before a leading blank line still sits beside the shown text', () => {
		const text = '\nJuni 1944\nVue de mon bureau\nRozenstraat\n' + 'c '.repeat(300);
		const start = text.indexOf('Rozenstraat');
		const shown = excerptWindow(excerpt({ text, mentions: [{ start, end: start + 11, quote: 'Rozenstraat' }], images: [img(0)] }), 100);
		expect(shown.text.startsWith('Juni 1944')).toBe(true);
		expect(shown.images).toEqual([img(0)]);
	});

	test('the collapsed card takes the image nearest the first mention', () => {
		const x = excerpt({ text: long, mentions, images: [img(0), img(at - 5), img(at + 300)] });
		expect(nearestImage(x)).toEqual(img(at - 5));
		expect(nearestImage(excerpt({ text: 'x' }))).toBeNull();
	});

	test('the text is cut where an image sits, in reading order', () => {
		const text = 'Vondelpark, Rosarium\n29 Oct 44';
		const blocks = excerptBlocks(excerpt({ text, images: [img(21), img(0)] }));
		expect(blocks.map((b) => b.kind)).toEqual(['image', 'text', 'image', 'text']);
	});

	test('a IIIF URL asks the scan for the box at a size', () => {
		expect(iiifImageUrl(img(0), ',600')).toBe('https://iiif.example/scan.jpg/80,806,1083,654/,600/0/default.jpg');
		expect(iiifImageUrl(img(0))).toBe('https://iiif.example/scan.jpg/80,806,1083,654/max/0/default.jpg');
	});
});
