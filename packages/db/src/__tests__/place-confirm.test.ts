/** The text scanner behind the confirming point resolver: pure string rules, no DB. */
import { describe, test, expect } from 'bun:test';
import { confirmByText, nameInText, nameQualifies } from '../etl/places/place-confirm';
import { normalizeName as normalize, nameTokens } from '../etl/places/normalize';
import { PlaceTrie } from '../etl/places/place-trie';
import type { Candidate } from '../etl/places/place-candidates';

const cand = (placeId: string, type: Candidate['type'], distanceM: number): Candidate =>
  ({ placeId, name: null, type, source: 'adamlink', distanceM, overlapDays: null, eraFit: true, dated: false });

describe('nameInText', () => {
  test('whole words, case and diacritics folded', () => {
    expect(nameInText('Kalverstraat 97', normalize('10½ uur, KALVERSTRAAT 97, Amsterdam'))).toBe(true);
    expect(nameInText('Kalverstraat 9', normalize('Kalverstraat 97'))).toBe(false);
    expect(nameInText('Dam', normalize('op het Damrak'))).toBe(false);
    expect(nameInText('Czaar Peterstraat', normalize('czaar péterstraat'))).toBe(true);
  });

  test('a house number may follow a comma, dot or no./nr.', () => {
    const n = 'Kalverstraat 97';
    expect(nameInText(n, 'kalverstraat, 97')).toBe(true);
    expect(nameInText(n, 'kalverstraat no. 97')).toBe(true);
    expect(nameInText(n, 'kalverstraat nr 97')).toBe(true);
    expect(nameInText(n, 'kalverstraat 95-97')).toBe(false); // a name's words follow each other
    expect(nameInText('Kalverstraat 95', 'kalverstraat 95-97')).toBe(true);
    expect(nameInText(n, 'kalverstraat 97a')).toBe(false);
  });

  test('punctuation is a word boundary, an apostrophe is not', () => {
    expect(nameInText('Nes 59', normalize('concerten in Frascati (Nes 59, Amsterdam).'))).toBe(true);
    expect(nameInText('Prinsengracht 436', normalize('paleis van justitie, prinsengracht 436; de curator'))).toBe(true);
    expect(nameInText('Banstraat 31', normalize('belastingconsulent Banstraat 31-Amsterdam (Z.)'))).toBe(true);
    expect(nameInText('Bremstraat 2', normalize('Bremstraat 2(tm) Amsterdam'))).toBe(true);
    expect(nameInText('Dam', normalize("gevraagd in A'dam-C."))).toBe(false);
  });

  test('a wijk-letter address matches as written', () => {
    expect(nameInText('E 52', normalize('wonende E 52, alhier'))).toBe(true);
    expect(nameInText('E 52', normalize('de 52 gulden'))).toBe(false);
  });
});

describe('one tokenizer for every scanner', () => {
  test('the words of a name or a text: case and diacritics folded, punctuation and nr./no. gone', () => {
    expect(nameTokens('Kalverstraat, nr. 97')).toEqual(['kalverstraat', '97']);
    expect(nameTokens('no 97, maar nee')).toEqual(['97', 'maar', 'nee']);
    expect(nameTokens('zei no tegen nr')).toEqual(['zei', 'no', 'tegen', 'nr']);
    expect(nameTokens('Czaar Péterstraat.')).toEqual(['czaar', 'peterstraat']);
    expect(nameTokens('95-97')).toEqual(['95', '97']);
    expect(nameTokens("in frascati (nes 59; 'de duif')")).toEqual(['in', 'frascati', 'nes', '59', 'de', 'duif']);
    expect(nameTokens("a'dam-c.")).toEqual(["a'dam", 'c']);
    expect(nameTokens("'s-Gravesandeplein 18")).toEqual(['s', 'gravesandeplein', '18']);
  });

  test('the trie finds in a text exactly the names the confirmation finds', () => {
    const names = ['Kalverstraat 97', 'Kalverstraat', 'Czaar Peterstraat', 'E 52', 'Dam'];
    const trie = new PlaceTrie(new Map(names.map((n) => [n, 'street'])));
    const texts = ['10½ uur, KALVERSTRAAT, nr. 97, Amsterdam', 'op het Damrak', 'czaar péterstraat', 'wonende E 52, alhier', 'kalverstraat 95-97'];
    for (const text of texts) {
      const byTrie = new Set(trie.match(text).map((m) => m.value));
      const byConfirmation = new Set(names.filter((n) => nameInText(n, normalize(text))));
      // the trie keeps the longest match at a position; every name it finds, the confirmation finds too
      for (const n of byTrie) expect(byConfirmation.has(n!)).toBe(true);
      expect(byTrie.size > 0).toBe(byConfirmation.size > 0);
    }
  });
});

describe('nameQualifies', () => {
  test('addresses need a number; a street or area name of any length counts', () => {
    expect(nameQualifies('Kalverstraat 97', 'address')).toBe(true);
    expect(nameQualifies('Kalverstraat', 'address')).toBe(false);
    expect(nameQualifies('Kalverstraat', 'street')).toBe(true);
    expect(nameQualifies('Dam', 'street')).toBe(true);
    expect(nameQualifies('Jordaan', 'neighbourhood')).toBe(true);
  });
});

describe('confirmByText', () => {
  const names = new Map([
    ['lp-old', ['E 52', 'F 3486']],
    ['lp-new', ['Kalverstraat 97']],
    ['street', ['Kalverstraat']],
    ['buurt', ['Burgwallen']]
  ]);
  const pool = [cand('lp-old', 'address', 2.4), cand('lp-new', 'address', 2.6), cand('street', 'street', 3), cand('buurt', 'neighbourhood', 0)];

  test('a named neighbour replaces the nearer unnamed one at its granularity', () => {
    const ids = confirmByText(pool, names, 'Perry & Co., Kalverstraat 97, Amsterdam').map((c) => c.placeId);
    expect(ids).toEqual(['lp-new', 'street', 'buurt']);
  });

  test('the era decides through the names: an older text confirms the older point', () => {
    const ids = confirmByText(pool, names, 'wonende E 52').map((c) => c.placeId);
    expect(ids).toEqual(['lp-old', 'street', 'buurt']);
  });

  test('a text naming only the street leaves the addresses as they were', () => {
    const ids = confirmByText(pool, names, 'in de Kalverstraat').map((c) => c.placeId);
    expect(ids).toEqual(['lp-old', 'lp-new', 'street', 'buurt']);
  });

  test('no name in the text changes nothing', () => {
    expect(confirmByText(pool, names, 'DORDRECHT. Hotel Ponsen')).toEqual(pool);
  });
});
