/**
 * The resolver cache: rows asking for the same key at the same time share one lookup,
 * a result is kept, and a failed lookup is asked again.
 */
import { describe, test, expect } from 'bun:test';
import { createCachedResolver } from '../etl/places/cache';

describe('resolver cache', () => {
  test('concurrent calls for one key share a lookup, and its result is kept', async () => {
    let lookups = 0;
    const resolve = createCachedResolver(async (key: string) => {
      lookups++;
      await new Promise((r) => setTimeout(r, 5));
      return key.toUpperCase();
    });
    expect(await Promise.all([resolve('a'), resolve('a'), resolve('b')])).toEqual(['A', 'A', 'B']);
    expect(lookups).toBe(2);
    expect(await resolve('a')).toBe('A');
    expect(lookups).toBe(2);
  });

  test('a failed lookup is not kept', async () => {
    let lookups = 0;
    const resolve = createCachedResolver(async () => {
      lookups++;
      if (lookups === 1) throw new Error('once');
      return 'ok';
    });
    await expect(resolve('k')).rejects.toThrow('once');
    expect(await resolve('k')).toBe('ok');
  });
});
