/**
 * A search hit on a card. The server marks the matching words of each matched value
 * between SEARCH_MARK_START and SEARCH_MARK_END; here those marks become the card's
 * marks: as marked strings in the title, the description and the entity's fields,
 * which the card's formatters pass through untouched, and as ranges on a diary's
 * excerpt, whose text the window addresses by offset.
 */
import type { Excerpt, FeatureResult } from '@atm/shared/types';
import {
	SEARCH_FIELD_DESCRIPTION,
	SEARCH_FIELD_TITLE,
	SEARCH_MARK_END,
	SEARCH_MARK_START
} from '@atm/shared/vocab';
import { wordWindow, type TextRange } from './excerpts';
import { TEXT_WINDOWS } from '#lib/config/text.js';

const EXCERPT_TEXT = '$.excerpts[*].text';

/** A marked string as its plain text and the ranges the marks covered. */
export function parseMarks(marked: string): { text: string; ranges: TextRange[] } {
	const ranges: TextRange[] = [];
	let text = '';
	let open: number | null = null;
	for (const ch of marked) {
		if (ch === SEARCH_MARK_START) {
			open = text.length;
		} else if (ch === SEARCH_MARK_END) {
			if (open !== null && text.length > open) {
				ranges.push({ start: open, end: text.length });
			}
			open = null;
		} else {
			text += ch;
		}
	}
	if (open !== null && text.length > open) {
		ranges.push({ start: open, end: text.length });
	}
	return { text, ranges };
}

/** The plain text with marks put back around the ranges; ranges past the text are clipped. */
export function markText(text: string, ranges: TextRange[]): string {
	let out = '';
	let cursor = 0;
	for (const r of [...ranges].sort((a, b) => a.start - b.start)) {
		const start = Math.min(Math.max(r.start, cursor), text.length);
		const end = Math.min(r.end, text.length);
		if (end <= start) continue;
		out += text.slice(cursor, start) + SEARCH_MARK_START + text.slice(start, end) + SEARCH_MARK_END;
		cursor = end;
	}
	return out + text.slice(cursor);
}

/** The marked values of a hit by field, each field's values in the order the server gave them. */
function hitsByField(feature: FeatureResult): Map<string, string[]> {
	const byField = new Map<string, string[]>();
	for (const hit of feature.foundBy ?? []) {
		byField.set(hit.field, [...(byField.get(hit.field) ?? []), hit.text]);
	}
	return byField;
}

// the marked text whose plain form is this value, if the field has one
function markedValue(texts: string[] | undefined, value: string): string | undefined {
	return texts?.find((t) => parseMarks(t).text === value);
}

// walk a jsonpath of the form $.a.b or $.a[*].b through a copy of the entity, marking the
// string leaves the hits cover; the excerpt text is left alone, it is marked by range
function markPath(node: unknown, steps: string[], texts: string[]): void {
	if (node === null || typeof node !== 'object' || steps.length === 0) return;
	const [step, ...rest] = steps;
	const key = step.replace(/\[\*\]$/, '');
	const each = step.endsWith('[*]');
	const holder = node as Record<string, unknown>;
	const value = holder[key];
	if (each) {
		if (!Array.isArray(value)) return;
		value.forEach((item, i) => {
			if (rest.length === 0) {
				if (typeof item === 'string') {
					const marked = markedValue(texts, item);
					if (marked !== undefined) value[i] = marked;
				}
			} else {
				markPath(item, rest, texts);
			}
		});
		return;
	}
	if (rest.length === 0) {
		if (typeof value === 'string') {
			const marked = markedValue(texts, value);
			if (marked !== undefined) holder[key] = marked;
		}
		return;
	}
	markPath(value, rest, texts);
}

/**
 * The feature with its matched values marked: the label, the description and the
 * entity's string fields the hits name, so the card shows them marked wherever it
 * shows them. Without hits, the feature itself.
 */
export function markFeature(feature: FeatureResult): FeatureResult {
	if (!feature.foundBy?.length) return feature;
	const byField = hitsByField(feature);
	const marked: FeatureResult = { ...feature };
	const title = markedValue(byField.get(SEARCH_FIELD_TITLE), feature.label);
	if (title !== undefined) marked.label = title;
	if (feature.description) {
		const description = markedValue(byField.get(SEARCH_FIELD_DESCRIPTION), feature.description);
		if (description !== undefined) marked.description = description;
	}
	if (feature.entity) {
		const entity = structuredClone(feature.entity);
		for (const [field, texts] of byField) {
			if (!field.startsWith('$.') || field === EXCERPT_TEXT) continue;
			markPath(entity, field.slice(2).split('.'), texts);
		}
		marked.entity = entity;
	}
	return marked;
}

/** The ranges a search marked in an excerpt's text, as the hits give them; none without a hit. */
export function excerptSearchRanges(feature: FeatureResult, excerpt: Excerpt): TextRange[] {
	const marked = markedValue(hitsByField(feature).get(EXCERPT_TEXT), excerpt.text);
	if (marked === undefined) return [];
	return parseMarks(marked).ranges;
}

/** The ranges moved onto a window of the text that starts at `offset`, clipped to its length. */
export function shiftRanges(ranges: TextRange[], offset: number, length: number): TextRange[] {
	const shifted: TextRange[] = [];
	for (const r of ranges) {
		const start = Math.max(r.start - offset, 0);
		const end = Math.min(r.end - offset, length);
		if (end > start) shifted.push({ start, end });
	}
	return shifted;
}

/** Whether a search is on, as the card sees it: the feature came with hits. */
export function hasSearchHits(feature: FeatureResult): boolean {
	return (feature.foundBy?.length ?? 0) > 0;
}

/**
 * A marked string cut to the words around its first mark, with the marks kept and an
 * ellipsis where the text was cut; unmarked, the string as it is.
 */
export function matchWindow(marked: string, margin: number = TEXT_WINDOWS.title): string {
	const { text, ranges } = parseMarks(marked);
	if (ranges.length === 0) return marked;
	const { start: from, end: to } = wordWindow(text, ranges[0], margin);
	const cut = markText(text.slice(from, to), shiftRanges(ranges, from, to - from));
	return `${from > 0 ? '…' : ''}${cut}${to < text.length ? '…' : ''}`;
}
