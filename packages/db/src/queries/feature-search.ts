/**
 * Feature text search: Dutch FTS over features.search_tsv (the title, the description
 * and the entity's searchable fields, weighted; see search-vector.ts), websearch syntax.
 * One definition of the match predicate, the rank and the search bitmap, so the
 * heatmap, histogram and feature list can never disagree on what "matches q" means
 * (see queries/time-filter.ts for the drift story that motivates this pattern), and
 * one explanation of a hit for the card.
 */
import { sql, type SQL } from 'drizzle-orm';
import { SEARCH_FIELD_PATHS, SEARCH_FIELD_TITLE, SEARCH_FIELD_DESCRIPTION, SEARCH_MARK_START, SEARCH_MARK_END } from '@atm/shared';
import { features } from '../schema';

/** Does tsvCol match q? The column is passed as SQL so aliased joins (f.search_tsv)
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
    FROM ${features} WHERE ${searchMatch(sql`${features.searchTsv}`, q)})`;
}

const HEADLINE_OPTIONS = `StartSel=${SEARCH_MARK_START}, StopSel=${SEARCH_MARK_END}, HighlightAll=true`;

/**
 * The values of a listed feature that match q, each with the matching words marked:
 * the title, the description, and every value of the entity's searchable fields
 * (SEARCH_FIELD_PATHS, one entry per array item), as a JSON array of {field, text}.
 * Postgres marks the words, so the card never has to repeat the stemming. NULL when
 * no value matches. `f` is the features alias of the surrounding query.
 */
export function foundBy(f: SQL, q: string): SQL {
  const query = sql`websearch_to_tsquery('dutch', ${q})`;
  const values = [
    sql`SELECT ${SEARCH_FIELD_TITLE} AS field, ${f}.label AS value`,
    sql`SELECT ${SEARCH_FIELD_DESCRIPTION}, ${f}.description`,
    ...SEARCH_FIELD_PATHS.map((path) =>
      sql`SELECT ${path}, v FROM jsonb_array_elements_text(coalesce(jsonb_path_query_array(${f}.entity, ${path}::jsonpath), '[]'::jsonb)) AS v`
    ),
  ];
  return sql`(
    SELECT jsonb_agg(jsonb_build_object('field', m.field, 'text', ts_headline('dutch', m.value, ${query}, ${HEADLINE_OPTIONS})))
    FROM (${sql.join(values, sql` UNION ALL `)}) m
    WHERE m.value IS NOT NULL AND to_tsvector('dutch', m.value) @@ ${query}
  )`;
}
