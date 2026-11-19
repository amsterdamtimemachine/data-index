/** The text scanner behind the confirming point resolver: pure string rules, no DB. */
import { describe, test, expect } from 'bun:test';
import { confirmByText, nameInText, nameQualifies } from '../etl/places/place-confirm';
import { normalizeName as normalize } from '../etl/places/normalize';
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
    expect(nameInText(n, 'kalverstraat 95-97')).toBe(false);
    expect(nameInText(n, 'kalverstraat 97a')).toBe(false);
  });

  test('a wijk-letter address matches as written', () => {
    expect(nameInText('E 52', normalize('wonende E 52, alhier'))).toBe(true);
    expect(nameInText('E 52', normalize('de 52 gulden'))).toBe(false);
  });
});

describe('nameQualifies', () => {
  test('addresses need a number, streets a minimum length', () => {
    expect(nameQualifies('Kalverstraat 97', 'address')).toBe(true);
    expect(nameQualifies('Kalverstraat', 'address')).toBe(false);
    expect(nameQualifies('Kalverstraat', 'street')).toBe(true);
    expect(nameQualifies('Dam', 'street')).toBe(false);
    expect(nameQualifies('Jordaan', 'neighbourhood')).toBe(false);
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
