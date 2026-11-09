/**
 * Text confirmation of a point's candidates: a candidate whose name is written in the
 * feature's text outranks its unnamed neighbours. Only names the point already put in
 * the pool are looked for; the text is never scanned for places in general.
 */
import { PLACE_TYPE_SPECS } from '@atm/shared';
import { GRANULARITIES, DISTANCE_TYPES, EVIDENCE_TYPES, type Candidate } from './place-candidates';
import { nameTokens } from './normalize';

// the same street and house names recur across thousands of rows
const tokensOf = new Map<string, string[]>();

function tokens(name: string): string[] {
  let t = tokensOf.get(name);
  if (!t) {
    t = nameTokens(name);
    tokensOf.set(name, t);
  }
  return t;
}

/** Whether the name's words occur among the text's, whole and in order. */
export function nameInTokens(name: string[], text: string[]): boolean {
  if (name.length === 0) return false;
  for (let i = 0; i + name.length <= text.length; i++) {
    let j = 0;
    while (j < name.length && text[i + j] === name[j]) j++;
    if (j === name.length) return true;
  }
  return false;
}

/** Whether a place name counts as evidence at all, by its type's rule (PLACE_TYPE_SPECS). */
export function nameQualifies(name: string, type: Candidate['type']): boolean {
  const evidence = PLACE_TYPE_SPECS[type].nameEvidence;
  if (evidence.kind === 'number') return /\p{N}/u.test(name);
  return true;
}

/** Whether a name is written in a text, word for word. */
export function nameInText(name: string, text: string): boolean {
  return nameInTokens(tokens(name), nameTokens(text));
}

/** Whether a text can decide for a candidate of this type: found by distance, or in need of naming. */
export function confirmable(type: Candidate['type']): boolean {
  return DISTANCE_TYPES.includes(type) || EVIDENCE_TYPES.includes(type);
}

/** The pool for a feature without a text: a type that needs naming cannot be a candidate. */
export function dropEvidenceTypes(pool: Candidate[]): Candidate[] {
  return pool.filter((c) => !EVIDENCE_TYPES.includes(c.type));
}

/**
 * The pool with each distance-found granularity narrowed to its confirmed candidates,
 * when it has any; a granularity with no name in the text keeps its full set, so a
 * text naming only the street still links to the nearest address as before. A place
 * found by containment is not in doubt, so it passes through. A type that needs
 * evidence stays only when named, and named it outranks an unnamed finer candidate: an
 * article naming the Oostergasfabriek links to it, not to the nearest address, unless
 * it names the address too.
 */
export function confirmByText(pool: Candidate[], names: Map<string, string[]>, text: string): Candidate[] {
  const words = nameTokens(text);
  const confirmed = new Set<string>();
  for (const c of pool) {
    if (!confirmable(c.type)) continue;
    const known = names.get(c.placeId) ?? [];
    if (known.some((n) => nameQualifies(n, c.type) && nameInTokens(tokens(n), words))) {
      confirmed.add(c.placeId);
    }
  }
  const confirmedTypes = new Set(pool.filter((c) => confirmed.has(c.placeId)).map((c) => c.type));
  // the finest named type that needs evidence; unnamed candidates finer than it yield to it
  const namedEvidence = GRANULARITIES.find((t) => EVIDENCE_TYPES.includes(t) && confirmedTypes.has(t));
  let yieldsBelow = -1;
  if (namedEvidence !== undefined) {
    yieldsBelow = GRANULARITIES.indexOf(namedEvidence);
  }
  return pool.filter((c) => {
    if (EVIDENCE_TYPES.includes(c.type)) return confirmed.has(c.placeId);
    if (GRANULARITIES.indexOf(c.type) < yieldsBelow && !confirmed.has(c.placeId)) return false;
    if (!GRANULARITIES.includes(c.type) || !confirmedTypes.has(c.type)) return true;
    return confirmed.has(c.placeId);
  });
}
