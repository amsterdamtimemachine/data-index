/**
 * The place-type registry is the one definition of the precision order: the resolvers'
 * granularity walk, the per-type caps and the SQL rank the queries sort by all follow
 * PLACE_TYPES, so a type added there reaches every consumer in the same position.
 */
import { describe, test, expect } from 'bun:test';
import { sql } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { PLACE_TYPES, PLACE_TYPE_SPECS, POINT_CAPS_M } from '@atm/shared';
import { GRANULARITIES, DISTANCE_TYPES, CONTAINMENT_TYPES, MAX_DISTANCE_M } from '../etl/places/place-candidates';
import { placeTypeRank } from '../queries/place-rank';

describe('place-type registry', () => {
  test('every type is described, and the resolvers walk the registry order', () => {
    expect(Object.keys(PLACE_TYPE_SPECS).sort()).toEqual([...PLACE_TYPES].sort());
    expect(GRANULARITIES).toEqual(PLACE_TYPES);
    expect([...DISTANCE_TYPES, ...CONTAINMENT_TYPES].sort()).toEqual([...PLACE_TYPES].sort());
  });

  test('a distance-found type has a cap, a containment-found type none', () => {
    for (const t of PLACE_TYPES) {
      if (PLACE_TYPE_SPECS[t].point === 'distance') {
        expect(MAX_DISTANCE_M[t]).toBe(POINT_CAPS_M[t]!);
      } else {
        expect(MAX_DISTANCE_M[t]).toBeNull();
      }
    }
  });

  test('the SQL rank numbers the types in registry order, unknown types last', () => {
    const query = new PgDialect().sqlToQuery(placeTypeRank(sql`p.type`));
    expect(query.params).toEqual([...PLACE_TYPES]);
    const expected = PLACE_TYPES.map((_, i) => `WHEN $${i + 1} THEN ${i}`).join(' ');
    expect(query.sql).toBe(`CASE p.type ${expected} ELSE ${PLACE_TYPES.length} END`);
  });
});
