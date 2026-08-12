import { sql, type SQL } from 'drizzle-orm';
import { featureToPlace, place, features, featureTags, tags } from '../schema';

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

/**
 * Subquery: the feature ids carrying ALL of `tagLabels` (AND semantics) — the
 * GROUP BY / HAVING COUNT(DISTINCT) shape that features.ts and tags.ts each
 * inlined. Optional filters narrow the population the same way the callers'
 * surrounding queries do (recordTypes/datasetIds join `features`; placeTypes
 * joins place via placeTypeJoin).
 */
export function featureIdsWithAllTags(
  tagLabels: string[],
  filters: { recordTypes?: string[]; datasetIds?: string[]; placeTypes?: string[] } = {}
): SQL {
  const { recordTypes, datasetIds, placeTypes } = filters;
  const needsFeatures = !!(recordTypes?.length || datasetIds?.length);
  return sql`
    SELECT ft.feature_id
    FROM ${featureTags} ft
    JOIN ${tags} t ON ft.tag_id = t.id
    ${needsFeatures ? sql`JOIN ${features} f ON ft.feature_id = f.id` : sql``}
    ${placeTypeJoin(placeTypes, sql`ft.feature_id`)}
    WHERE t.label IN ${tagLabels}
      ${andIn(sql`f.record_type`, recordTypes)}
      ${andIn(sql`f.dataset_id`, datasetIds)}
      ${andIn(sql`p.type`, placeTypes)}
    GROUP BY ft.feature_id
    HAVING COUNT(DISTINCT t.id) = ${tagLabels.length}`;
}

/** Subquery: the feature ids carrying ANY of `tagLabels` (OR semantics). */
export function featureIdsWithAnyTag(tagLabels: string[]): SQL {
  return sql`
    SELECT DISTINCT ft.feature_id
    FROM ${featureTags} ft
    JOIN ${tags} t ON ft.tag_id = t.id
    WHERE t.label IN ${tagLabels}`;
}
