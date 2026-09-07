/**
 * Feature text search: Dutch FTS over features.label_tsv, websearch syntax.
 * One definition of the match predicate, the rank and the search bitmap, so the
 * heatmap, histogram and feature list can never disagree on what "matches q" means
 * (see queries/time-filter.ts for the drift story that motivates this pattern).
 */
import { sql, type SQL } from 'drizzle-orm';
import { features } from '../schema';

/** Does tsvCol match q? The column is passed as SQL so aliased joins (f.label_tsv)
 * and the bare table share the fragment. */
export function searchMatch(tsvCol: SQL, q: string): SQL {
  return sql`${tsvCol} @@ websearch_to_tsquery('dutch', ${q})`;
}

/** Match quality of tsvCol against q — the bestMatch sort's lane key. */
export function searchRank(tsvCol: SQL, q: string): SQL {
  return sql`ts_rank(${tsvCol}, websearch_to_tsquery('dutch', ${q}))`;
}

/**
 * Scalar subquery: roaring bitmap of feature_int_id over every feature matching q —
 * the search set the cell_features intersections consume. Uncorrelated, so Postgres
 * evaluates it once per statement. NULL when nothing matches (including a q of only
 * stopwords, which parses to an empty tsquery); countMatchesExpr folds that to 0.
 */
export function searchBitmap(q: string): SQL {
  return sql`(SELECT rb_build(array_agg(feature_int_id ORDER BY feature_int_id))
    FROM ${features} WHERE ${searchMatch(sql`${features.labelTsv}`, q)})`;
}
