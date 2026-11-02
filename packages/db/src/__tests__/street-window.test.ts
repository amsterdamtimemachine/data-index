/**
 * A street's existence years as a place_geometry window: the end year is still a year
 * the street existed, and until is exclusive, so it ends on the first day of the year after.
 */
import { describe, test, expect } from 'bun:test';
import { streetWindow } from '../etl/sources/adamlink-streets';

describe('streetWindow', () => {
  test('the end year is included, the window stays open without one', () => {
    expect(streetWindow({ since: '1380', until: '1663' })).toEqual({ since: '1380-01-01', until: '1664-01-01' });
    expect(streetWindow({ since: '1873', until: null })).toEqual({ since: '1873-01-01', until: null });
    expect(streetWindow({ since: null, until: null })).toEqual({ since: null, until: null });
  });
});
