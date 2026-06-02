import { sql, type SQL } from 'drizzle-orm';
import { featureToPlace, place } from '../schema';

/**
 * Optional `AND <col> IN (...)` predicate — empty SQL when the list is absent or
 * empty, so an inactive filter contributes nothing to the WHERE clause.
 * Centralises the "no values → no filter" rule every query repeated inline.
 */
export function andIn(col: SQL, values: string[] | undefined): SQL {
  return values && values.length > 0 ? sql`AND ${col} IN ${values}` : sql``;
}

/**
 * Optional join to `place` (aliased `p`, via `feature_to_place fp`) so a query
 * whose base table is `features` can filter by place.type. Empty SQL when no
 * place-type filter is active. `featureIdCol` is the feature id in the
 * surrounding query (e.g. sql`f.id`). Pair with andIn(sql`p.type`, placeTypes).
 */
export function placeTypeJoin(placeTypes: string[] | undefined, featureIdCol: SQL): SQL {
  return placeTypes && placeTypes.length > 0
    ? sql`JOIN ${featureToPlace} fp ON fp.feature_id = ${featureIdCol} JOIN ${place} p ON fp.place_id = p.id`
    : sql``;
}
