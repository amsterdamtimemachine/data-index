/**
 * What search reads is what the card can show: every searchable field's label is a
 * field the card has for that entity type, or the content it renders (a programme's
 * items, a diary's text), and every label has its translation, so a hit can always
 * be pointed at on the card and named.
 */
import { describe, test, expect } from 'vitest';
import { SEARCH_FIELDS } from '@atm/shared/vocab';
import type { Entity } from '@atm/shared/types';
import { cardFieldLabels } from './cardFields';
import { translate } from './translations';

// labels of content the card renders outside its field rows
const CONTENT_LABELS: Partial<Record<Entity['type'], string[]>> = {
	ScreeningEvent: ['film', 'performer'],
	TheaterEvent: ['film', 'performer'],
	Manuscript: ['text']
};

describe('searchable fields', () => {
	test('every searchable field is one the card shows, and has a translation', () => {
		for (const [type, fields] of Object.entries(SEARCH_FIELDS) as [
			Entity['type'],
			{ path: string; label: string }[]
		][]) {
			const showable = new Set([...cardFieldLabels(type), ...(CONTENT_LABELS[type] ?? [])]);
			for (const field of fields) {
				expect(showable.has(field.label), `${type} ${field.path} (${field.label})`).toBe(true);
				expect(translate(field.label), field.label).not.toBe(field.label);
			}
		}
	});
});
