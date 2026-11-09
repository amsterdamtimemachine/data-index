import type { Entity } from '../types/feature';

/** A searchable field of an entity: the jsonpath to its value, or values, and the card label it shows under. */
export interface SearchField {
  path: string;
  label: string;
}

/**
 * What the text search reads of each entity type beyond the title and the description:
 * only values the card shows, so a hit can always be pointed at on the card. An array
 * path yields one value per item (the films on a programme, the excerpts of an entry).
 */
export const SEARCH_FIELDS: Partial<Record<Entity['type'], SearchField[]>> = {
  Person: [
    { path: '$.birthPlace', label: 'born' },
    { path: '$.deathPlace', label: 'died' },
  ],
  MediaObject: [{ path: '$.author', label: 'author' }],
  // a programme's items are films or live acts; the card labels each by its kind
  ScreeningEvent: [
    { path: '$.location.name', label: 'venue' },
    { path: '$.items[*].name', label: 'film' },
  ],
  TheaterEvent: [
    { path: '$.location.name', label: 'venue' },
    { path: '$.items[*].name', label: 'performer' },
  ],
  Manuscript: [
    { path: '$.author.name', label: 'author' },
    { path: '$.isPartOf.name', label: 'diary' },
    { path: '$.excerpts[*].text', label: 'text' },
  ],
};

/** Every searchable path once; the index and the hit explanation read the same list. */
export const SEARCH_FIELD_PATHS: string[] = [...new Set(Object.values(SEARCH_FIELDS).flat().map((f) => f.path))];

/** The field names of a hit beyond the entity's paths. */
export const SEARCH_FIELD_TITLE = 'title';
export const SEARCH_FIELD_DESCRIPTION = 'description';

/** In a hit's text, the matching words sit between these two characters. */
export const SEARCH_MARK_START = '\u0001';
export const SEARCH_MARK_END = '\u0002';

/** One matching value of a listed feature: which field, and its text with the matches marked. */
export interface SearchHit {
  field: string;
  text: string;
}
