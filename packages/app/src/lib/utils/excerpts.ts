/**
 * A story's excerpt on the card: which of the entry's excerpts belongs to the shown
 * place, the shorter window the collapsed card shows, the text split into plain and
 * marked pieces (the place's mentions, or a search's matches), and the images it shows.
 */
import type { Excerpt, ExcerptImage, ManuscriptEntity } from '@atm/shared/types';
import { foldLinesInline } from './format';

/**
 * How much text the collapsed card shows around what matters, in characters: a diary
 * excerpt's whole window around the place mention or the search match, and the margin
 * either side of a search match in the title. A window is cut to whole words and
 * never exceeds its size.
 */
export const TEXT_WINDOWS = { excerpt: 250, title: 16 };

export type TextRange = { start: number; end: number };

export type TextSegment = { text: string; marked: boolean };

/** The excerpt cut for the shown place, else the entry's first. */
export function pickExcerpt(entity: ManuscriptEntity, placeId?: string): Excerpt | null {
	const list = entity.excerpts ?? [];
	if (list.length === 0) {
		return null;
	}
	if (placeId) {
		const match = list.find((x) => x.placeId === placeId);
		if (match) {
			return match;
		}
	}
	return list[0];
}

function isSpace(ch: string): boolean {
	return /\s/.test(ch);
}

/**
 * The piece of a text around a range: up to `margin` characters more on each side,
 * cut back to whole words and trimmed, so it never exceeds its size; when one side
 * runs into the text's end, the other side takes the rest.
 */
export function wordWindow(text: string, range: TextRange, margin: number): TextRange {
	let lo = range.start - margin;
	let hi = range.end + margin;
	if (hi > text.length) {
		lo -= hi - text.length;
		hi = text.length;
	}
	if (lo < 0) {
		hi = Math.min(hi - lo, text.length);
		lo = 0;
	}
	// start after the next space and end before the previous one, never inside a word
	if (lo > 0 && !isSpace(text[lo - 1])) {
		while (lo < text.length && !isSpace(text[lo])) {
			lo++;
		}
	}
	if (hi < text.length && !isSpace(text[hi])) {
		while (hi > lo && !isSpace(text[hi - 1])) {
			hi--;
		}
	}
	while (lo < hi && isSpace(text[lo])) {
		lo++;
	}
	while (hi > lo && isSpace(text[hi - 1])) {
		hi--;
	}
	return { start: lo, end: hi };
}

/**
 * About `length` characters of the excerpt around its anchor, the first place mention
 * unless given (a search match; nothing, for the opening), cut on word boundaries.
 */
export function excerptWindow(excerpt: Excerpt, length: number = TEXT_WINDOWS.excerpt, anchor: TextRange | undefined = excerpt.mentions[0]): Excerpt {
	const text = excerpt.text;
	if (text.length <= length) {
		return excerpt;
	}
	// the text's own edges, so skipped whitespace never counts as a cut
	let textStart = 0;
	while (textStart < text.length && isSpace(text[textStart])) {
		textStart++;
	}
	let textEnd = text.length;
	while (textEnd > textStart && isSpace(text[textEnd - 1])) {
		textEnd--;
	}
	// the window around the anchor, the length shared over both its sides
	const around = anchor ?? { start: 0, end: 0 };
	const margin = Math.max(Math.floor((length - (around.end - around.start)) / 2), 0);
	const { start: lo, end: hi } = wordWindow(text, around, margin);
	// an image separated from the shown text by whitespace only still sits beside it
	let imagesLo = lo;
	while (imagesLo > 0 && isSpace(text[imagesLo - 1])) {
		imagesLo--;
	}
	let imagesHi = hi;
	while (imagesHi < text.length && isSpace(text[imagesHi])) {
		imagesHi++;
	}
	return {
		...excerpt,
		text: text.slice(lo, hi),
		truncatedBefore: excerpt.truncatedBefore || lo > textStart,
		truncatedAfter: excerpt.truncatedAfter || hi < textEnd,
		mentions: excerpt.mentions
			.filter((m) => m.start >= lo && m.end <= hi)
			.map((m) => ({ ...m, start: m.start - lo, end: m.end - lo })),
		images: (excerpt.images ?? [])
			.filter((img) => img.anchor >= imagesLo && img.anchor <= imagesHi)
			.map((img) => ({ ...img, anchor: Math.min(Math.max(img.anchor, lo), hi) - lo }))
	};
}

/** Where a window's text starts in the whole excerpt's, so ranges on the whole can be moved onto the window. */
export function windowOffset(whole: Excerpt, shown: Excerpt): number {
	if (!shown.text) {
		return 0;
	}
	return Math.max(whole.text.indexOf(shown.text), 0);
}

/** The last image before the text begins, for the collapsed card; null when none precedes it. */
export function precedingImage(excerpt: Excerpt): ExcerptImage | null {
	let textStart = 0;
	while (textStart < excerpt.text.length && isSpace(excerpt.text[textStart])) {
		textStart++;
	}
	let preceding: ExcerptImage | null = null;
	for (const image of excerpt.images ?? []) {
		if (image.anchor <= textStart && (!preceding || image.anchor >= preceding.anchor)) {
			preceding = image;
		}
	}
	return preceding;
}

export type ExcerptBlock = { kind: 'text'; segments: TextSegment[] } | { kind: 'image'; image: ExcerptImage };

/** The excerpt in reading order: its text, cut where an image sits, and the images between, with the marks (its mentions unless given) on the text. */
export function excerptBlocks(excerpt: Excerpt, marks: TextRange[] = excerpt.mentions): ExcerptBlock[] {
	const blocks: ExcerptBlock[] = [];
	const pushText = (from: number, to: number) => {
		const text = excerpt.text.slice(from, to);
		if (!text.trim()) {
			return;
		}
		const within = marks
			.filter((r) => r.end > from && r.start < to)
			.map((r) => ({ start: Math.max(r.start, from) - from, end: Math.min(r.end, to) - from }));
		blocks.push({ kind: 'text', segments: foldSegments(segmentText(text, within)) });
	};
	let at = 0;
	const images = [...(excerpt.images ?? [])].sort((a, b) => a.anchor - b.anchor);
	for (const image of images) {
		pushText(at, image.anchor);
		blocks.push({ kind: 'image', image });
		at = image.anchor;
	}
	pushText(at, excerpt.text.length);
	return blocks;
}

/** The text in order, the ranges as marked pieces; in order, an overlapping or malformed one skipped. */
export function segmentText(text: string, ranges: TextRange[]): TextSegment[] {
	const segments: TextSegment[] = [];
	let cursor = 0;
	for (const r of [...ranges].sort((a, b) => a.start - b.start)) {
		if (r.start < cursor || r.end > text.length || r.end <= r.start) {
			continue;
		}
		if (r.start > cursor) {
			segments.push({ text: text.slice(cursor, r.start), marked: false });
		}
		segments.push({ text: text.slice(r.start, r.end), marked: true });
		cursor = r.end;
	}
	if (cursor < text.length) {
		segments.push({ text: text.slice(cursor), marked: false });
	}
	return segments;
}

/** Each piece folded to prose; only the outer edges are trimmed, so the marks keep their spacing. */
export function foldSegments(segments: TextSegment[]): TextSegment[] {
	const folded = segments.map((s) => ({ ...s, text: foldLinesInline(s.text) }));
	if (folded.length > 0) {
		folded[0].text = folded[0].text.trimStart();
		folded[folded.length - 1].text = folded[folded.length - 1].text.trimEnd();
	}
	return folded.filter((s) => s.text.length > 0);
}
