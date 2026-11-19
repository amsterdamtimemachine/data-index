/**
 * The words a name or a text is compared by, for every scanner alike: normalised and
 * split on anything that is not a letter, a digit or an apostrophe, so "(Kalverstraat,
 * nr. 97;", "Kalverstraat 97-Amsterdam" and "Kalverstraat 97" share their words; the
 * abbreviation "nr"/"no" right before a number is dropped. The apostrophe keeps "A'dam"
 * one word, so it is never the Dam. A name's words must follow each other in the text,
 * so a range "95-97" is Kalverstraat 95, not 97.
 */
export function nameTokens(text: string): string[] {
  const words = normalizeName(text)
    .split(/[^\p{L}\p{N}']+/u)
    .map((t) => t.replace(/^'+|'+$/g, ''))
    .filter((t) => t.length > 0);
  return words.filter((t, i) => !((t === 'nr' || t === 'no') && /^\p{N}/u.test(words[i + 1] ?? '')));
}

/** One spelling for comparing place names and texts: diacritics folded, lower case, single spaces. */
export function normalizeName(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}
