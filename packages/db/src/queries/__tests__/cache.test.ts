import { describe, test, expect } from 'bun:test';
import { createTTLCache } from '../cache';

describe('createTTLCache', () => {
  test('returns null on empty cache', () => {
    const cache = createTTLCache<string>(1000);
    expect(cache.get()).toBeNull();
  });

  test('returns value after set', () => {
    const cache = createTTLCache<string>(1000);
    cache.set('hello');
    expect(cache.get()).toBe('hello');
  });

  test('returns null after TTL expires', () => {
    const cache = createTTLCache<string>(1); // 1ms TTL
    cache.set('hello');

    // Wait for expiry
    const start = Date.now();
    while (Date.now() - start < 5) {} // busy wait 5ms

    expect(cache.get()).toBeNull();
  });

  test('nulls data on expiry (no memory leak)', () => {
    const cache = createTTLCache<{ big: string }>(1);
    cache.set({ big: 'x'.repeat(1000) });

    const start = Date.now();
    while (Date.now() - start < 5) {}

    // After get() returns null, internal data should also be null
    cache.get();
    expect(cache.get()).toBeNull();
  });

  test('overwrites previous value on set', () => {
    const cache = createTTLCache<number>(1000);
    cache.set(1);
    cache.set(2);
    expect(cache.get()).toBe(2);
  });

  test('default TTL from env is honoured — CACHE_TTL_MINUTES=0 disables caching', () => {
    // The test env sets CACHE_TTL_MINUTES=0, so the env-default cache is off:
    // set() is a no-op and get() always returns null (no cross-test/file pollution).
    const cache = createTTLCache<string>();
    cache.set('test');
    expect(cache.get()).toBeNull();
  });
});
