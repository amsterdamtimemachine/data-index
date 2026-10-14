/**
 * Text confirmation of a point's candidates: a candidate whose name is written in the
 * feature's text outranks its unnamed neighbours. Only names the point already put in
 * the pool are looked for; the text is never scanned for places in general.
 */
import { GRANULARITIES, type Candidate } from './place-candidates';
import { normalizeName } from './normalize';

// a street name this short ("Dam", "IJ") is too easy to find by accident
export const MIN_STREET_NAME_LENGTH = 4;

const BOUNDARY_BEFORE = '(?<![\\p{L}\\p{N}])';
const BOUNDARY_AFTER = '(?![\\p{L}\\p{N}])';
// between a name's tokens: spaces, a comma or dot, an optional "no."/"nr." before a number
const TOKEN_GAP = '[\\s,.]*(?:n[or]\\.?\\s*)?';

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// the same street and house names recur across thousands of rows
const patterns = new Map<string, RegExp>();

export function namePattern(name: string): RegExp {
  let pattern = patterns.get(name);
  if (!pattern) {
    const tokens = normalizeName(name).split(/[\s,.]+/).filter((t) => t.length > 0).map(escapeRegex);
    pattern = new RegExp(`${BOUNDARY_BEFORE}${tokens.join(TOKEN_GAP)}${BOUNDARY_AFTER}`, 'u');
    patterns.set(name, pattern);
  }
  return pattern;
}

/** Whether a place name counts as evidence at all for its granularity. */
export function nameQualifies(name: string, type: Candidate['type']): boolean {
  if (type === 'address') return /\p{N}/u.test(name);
  if (type === 'street') return normalizeName(name).length >= MIN_STREET_NAME_LENGTH;
  return false;
}

export function nameInText(name: string, normalizedText: string): boolean {
  return namePattern(name).test(normalizedText);
}

/**
 * The pool with each granularity narrowed to its confirmed candidates, when it has
 * any; a granularity with no name in the text keeps its full set, so a text naming
 * only the street still links to the nearest address as before. Areas pass through.
 */
export function confirmByText(pool: Candidate[], names: Map<string, string[]>, text: string): Candidate[] {
  const normalized = normalizeName(text);
  const confirmed = new Set<string>();
  for (const c of pool) {
    if (c.type !== 'address' && c.type !== 'street') continue;
    const known = names.get(c.placeId) ?? [];
    if (known.some((n) => nameQualifies(n, c.type) && nameInText(n, normalized))) {
      confirmed.add(c.placeId);
    }
  }
  const confirmedTypes = new Set(pool.filter((c) => confirmed.has(c.placeId)).map((c) => c.type));
  return pool.filter((c) => {
    if (!GRANULARITIES.includes(c.type) || !confirmedTypes.has(c.type)) return true;
    return confirmed.has(c.placeId);
  });
}
