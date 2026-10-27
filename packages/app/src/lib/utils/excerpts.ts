/**
 * A story's excerpt on the card: which of the entry's excerpts belongs to the shown
 * place, the shorter window the collapsed card shows, the text split into plain and
 * marked pieces around the place's mentions, and the images it shows.
 */
import type { Excerpt, ExcerptImage, ExcerptMention, ManuscriptEntity } from '@atm/shared/types';
import { foldLinesInline } from './format';

export const COLLAPSED_EXCERPT_LENGTH = 250;

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

/** About `length` characters around the first mention, cut on word boundaries. */
export function excerptWindow(excerpt: Excerpt, length: number): Excerpt {
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
	const first = excerpt.mentions[0];
	let center = 0;
	if (first) {
		center = Math.floor((first.start + first.end) / 2);
	}
	let lo = Math.max(0, center - Math.floor(length / 2));
	let hi = Math.min(text.length, lo + length);
	if (hi === text.length) {
		lo = Math.max(0, hi - length);
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

/** The image anchored nearest the place's first mention, for the collapsed card. */
export function nearestImage(excerpt: Excerpt): ExcerptImage | null {
	const images = excerpt.images ?? [];
	if (images.length === 0) {
		return null;
	}
	const mention = excerpt.mentions[0]?.start ?? 0;
	let nearest = images[0];
	for (const image of images) {
		if (Math.abs(image.anchor - mention) < Math.abs(nearest.anchor - mention)) {
			nearest = image;
		}
	}
	return nearest;
}

export type ExcerptBlock = { kind: 'text'; segments: TextSegment[] } | { kind: 'image'; image: ExcerptImage };

/** The excerpt in reading order: its text, cut where an image sits, and the images between. */
export function excerptBlocks(excerpt: Excerpt): ExcerptBlock[] {
	const blocks: ExcerptBlock[] = [];
	const pushText = (from: number, to: number) => {
		const text = excerpt.text.slice(from, to);
		if (!text.trim()) {
			return;
		}
		const mentions = excerpt.mentions
			.filter((m) => m.start >= from && m.end <= to)
			.map((m) => ({ ...m, start: m.start - from, end: m.end - from }));
		blocks.push({ kind: 'text', segments: foldSegments(segmentText(text, mentions)) });
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

/** The text in order, the mentions as marked pieces. */
export function segmentText(text: string, mentions: ExcerptMention[]): TextSegment[] {
	const segments: TextSegment[] = [];
	let cursor = 0;
	const sorted = [...mentions].sort((a, b) => a.start - b.start);
	for (const m of sorted) {
		if (m.start < cursor || m.end > text.length || m.end <= m.start) {
			continue;
		}
		if (m.start > cursor) {
			segments.push({ text: text.slice(cursor, m.start), marked: false });
		}
		segments.push({ text: text.slice(m.start, m.end), marked: true });
		cursor = m.end;
	}
	if (cursor < text.length) {
		segments.push({ text: text.slice(cursor), marked: false });
	}
	return segments;
}

/** Each piece folded to prose; only the outer edges are trimmed, so the marks keep their spacing. */
export function foldSegments(segments: TextSegment[]): TextSegment[] {
	const folded = segments.map((s) => ({ text: foldLinesInline(s.text), marked: s.marked }));
	if (folded.length > 0) {
		folded[0].text = folded[0].text.trimStart();
		folded[folded.length - 1].text = folded[folded.length - 1].text.trimEnd();
	}
	return folded.filter((s) => s.text.length > 0);
}
