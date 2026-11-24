/**
 * Tag filtering, one definition for the aggregates and the feature list so they
 * can never disagree on what "carries these tags" means (the same pattern as
 * feature-search.ts). Tags are matched by id.
 */
import { sql, type SQL } from 'drizzle-orm';
import type { TagOperator } from '@atm/shared';
import { featureTags, tagFeatures } from '../schema';

/**
 * Scalar subquery: roaring bitmap of feature_int_id over the features carrying the
 * tags, read from the precomputed per-tag bitmaps. OR unions them; AND intersects
 * them and yields NULL (no matches) unless every requested tag has a bitmap, so a
 * tag nothing carries can never be silently ignored. countMatchesExpr folds NULL to 0.
 */
export function tagBitmap(tagIds: string[], operator: TagOperator): SQL {
  if (operator === 'AND') {
    return sql`(SELECT CASE WHEN COUNT(*) = ${tagIds.length} THEN rb_and_agg(${tagFeatures.featureIds}) END
      FROM ${tagFeatures} WHERE ${tagFeatures.tagId} IN ${tagIds})`;
  }
  return sql`(SELECT rb_or_agg(${tagFeatures.featureIds})
    FROM ${tagFeatures} WHERE ${tagFeatures.tagId} IN ${tagIds})`;
}

/**
 * How many of the selected tags the feature (its id column passed as SQL, e.g.
 * sql`f.id`) carries. Index-backed per row: the AND predicate and the sample sort's
 * weighting both read it.
 */
export function tagMatchCount(featureIdCol: SQL, tagIds: string[]): SQL {
  return sql`(SELECT COUNT(DISTINCT ft.tag_id) FROM ${featureTags} ft
    WHERE ft.feature_id = ${featureIdCol} AND ft.tag_id IN ${tagIds})`;
}

/**
 * Row predicate for the feature list: does the feature carry the tags? Per row,
 * the right tool for a paginated query; the bitmap above serves the aggregates.
 */
export function tagMatch(featureIdCol: SQL, tagIds: string[], operator: TagOperator): SQL {
  if (operator === 'AND') {
    return sql`${tagMatchCount(featureIdCol, tagIds)} = ${tagIds.length}`;
  }
  return sql`EXISTS (SELECT 1 FROM ${featureTags} ft
    WHERE ft.feature_id = ${featureIdCol} AND ft.tag_id IN ${tagIds})`;
}
