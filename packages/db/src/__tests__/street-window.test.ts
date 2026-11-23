/**
 * A place's existence years as a place_geometry window: the end year is still a year
 * the place existed, and until is exclusive, so it ends on the first day of the year after.
 */
import { describe, test, expect } from 'bun:test';
import { existenceWindow } from '../etl/sources/adamlink-places';

describe('existenceWindow', () => {
  test('the end year is included, the window stays open without one', () => {
    expect(existenceWindow({ since: '1380', until: '1663' })).toEqual({ since: '1380-01-01', until: '1664-01-01' });
    expect(existenceWindow({ since: '1873', until: null })).toEqual({ since: '1873-01-01', until: null });
    expect(existenceWindow({ since: null, until: null })).toEqual({ since: null, until: null });
  });
});
