/**
 * Text confirmation of a point's candidates: a candidate whose name is written in the
 * feature's text outranks its unnamed neighbours. Only names the point already put in
 * the pool are looked for; the text is never scanned for places in general.
 */
import { PLACE_TYPE_SPECS } from '@atm/shared';
import { GRANULARITIES, DISTANCE_TYPES, type Candidate } from './place-candidates';
import { normalizeName } from './normalize';

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

/** Whether a place name counts as evidence at all, by its type's rule (PLACE_TYPE_SPECS). */
export function nameQualifies(name: string, type: Candidate['type']): boolean {
  const evidence = PLACE_TYPE_SPECS[type].nameEvidence;
  if (evidence.kind === 'number') return /\p{N}/u.test(name);
  return true;
}

export function nameInText(name: string, normalizedText: string): boolean {
  return namePattern(name).test(normalizedText);
}

/**
 * The pool with each distance-found granularity narrowed to its confirmed candidates,
 * when it has any; a granularity with no name in the text keeps its full set, so a
 * text naming only the street still links to the nearest address as before. A place
 * found by containment is not in doubt, so it passes through.
 */
export function confirmByText(pool: Candidate[], names: Map<string, string[]>, text: string): Candidate[] {
  const normalized = normalizeName(text);
  const confirmed = new Set<string>();
  for (const c of pool) {
    if (!DISTANCE_TYPES.includes(c.type)) continue;
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
