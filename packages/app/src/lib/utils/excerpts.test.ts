import { describe, test, expect } from 'vitest';
import type { Excerpt, ManuscriptEntity } from '@atm/shared/types';
import { pickExcerpt, excerptWindow, segmentText, foldSegments } from './excerpts';

const excerpt = (over: Partial<Excerpt>): Excerpt => ({
	place: 'p',
	text: '',
	truncatedBefore: false,
	truncatedAfter: false,
	mentions: [],
	...over
});

describe('pickExcerpt', () => {
	const entity = { type: 'Manuscript', name: '', excerpts: [excerpt({ place: 'a', placeId: 'ia' }), excerpt({ place: 'b', placeId: 'ib' })], textLength: 0, mentions: [] } as unknown as ManuscriptEntity;

	test('the excerpt stamped with the shown place, else the first', () => {
		expect(pickExcerpt(entity, 'ib')?.place).toBe('b');
		expect(pickExcerpt(entity, 'other')?.place).toBe('a');
		expect(pickExcerpt(entity)?.place).toBe('a');
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
