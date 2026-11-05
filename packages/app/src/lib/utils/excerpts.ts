/**
 * A story's excerpt on the card: which of the entry's excerpts belongs to the shown
 * place, the shorter window the collapsed card shows, the text split into plain and
 * marked pieces (the place's mentions, or a search's matches), and the images it shows.
 */
import type { Excerpt, ExcerptImage, ManuscriptEntity } from '@atm/shared/types';
import { foldLinesInline } from './format';
import { TEXT_WINDOWS } from '#lib/config/text.js';

export type TextRange = { start: number; end: number };

/** What to mark in a text: the place's mentions (bold), a search's matches (marked). */
export type TextMarks = { place?: TextRange[]; search?: TextRange[] };

export type TextSegment = { text: string; place: boolean; search: boolean };

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

/** A window cut from an excerpt, and where its text starts in the whole, so ranges on the whole can be moved onto it. */
export type ExcerptWindow = { excerpt: Excerpt; offset: number };

/**
 * About `length` characters of the excerpt around its anchor, the first place mention
 * unless given (a search match; nothing, for the opening), cut on word boundaries.
 */
export function excerptWindow(excerpt: Excerpt, length: number = TEXT_WINDOWS.excerpt, anchor: TextRange | undefined = excerpt.mentions[0]): ExcerptWindow {
	const text = excerpt.text;
	if (text.length <= length) {
		return { excerpt, offset: 0 };
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
		excerpt: {
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
		},
		offset: lo
	};
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
export function excerptBlocks(excerpt: Excerpt, marks: TextMarks = { place: excerpt.mentions }): ExcerptBlock[] {
	const blocks: ExcerptBlock[] = [];
	const pushText = (from: number, to: number) => {
		const text = excerpt.text.slice(from, to);
		if (!text.trim()) {
			return;
		}
		const within = (ranges: TextRange[] = []) =>
			ranges.filter((r) => r.end > from && r.start < to).map((r) => ({ start: Math.max(r.start, from) - from, end: Math.min(r.end, to) - from }));
		blocks.push({ kind: 'text', segments: foldSegments(segmentText(text, { place: within(marks.place), search: within(marks.search) })) });
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

// the ranges in order, an overlapping or malformed one skipped
function tidy(text: string, ranges: TextRange[] = []): TextRange[] {
	const kept: TextRange[] = [];
	let cursor = 0;
	for (const r of [...ranges].sort((a, b) => a.start - b.start)) {
		if (r.start < cursor || r.end > text.length || r.end <= r.start) {
			continue;
		}
		kept.push({ start: r.start, end: r.end });
		cursor = r.end;
	}
	return kept;
}

/** The text in order as pieces, each flagged by the marks that cover it; a piece can carry both. */
export function segmentText(text: string, marks: TextMarks): TextSegment[] {
	const place = tidy(text, marks.place);
	const search = tidy(text, marks.search);
	const cuts = new Set<number>([0, text.length]);
	for (const r of [...place, ...search]) {
		cuts.add(r.start);
		cuts.add(r.end);
	}
	const edges = [...cuts].sort((a, b) => a - b);
	const covered = (ranges: TextRange[], a: number, b: number) => ranges.some((r) => r.start <= a && r.end >= b);
	const segments: TextSegment[] = [];
	for (let i = 0; i + 1 < edges.length; i++) {
		const [a, b] = [edges[i], edges[i + 1]];
		if (b <= a) continue;
		segments.push({ text: text.slice(a, b), place: covered(place, a, b), search: covered(search, a, b) });
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
