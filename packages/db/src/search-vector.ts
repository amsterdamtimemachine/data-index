/**
 * The text search column, built from what the index already holds: the title at weight
 * A, the description at B, the entity's searchable values (SEARCH_FIELDS) at C. Words
 * as written (the `simple` configuration: lowercased, nothing stemmed, nothing dropped),
 * so a name matches itself and not a lookalike. One expression for the schema's generated column and
 * the test DDL, as DDL text: a generated column takes no parameters.
 */
import { SEARCH_FIELD_PATHS } from '@atm/shared';

// Postgres weighs a match by its label when ranking (ts_rank, the Beste match sort):
// A counts 1.0, B 0.4, C 0.2, D 0.1. So a title hit outranks a description hit, and
// that outranks a hit in one of the entity's fields.
const WEIGHT = { title: 'A', description: 'B', field: 'C' } as const;

function literal(s: string): string {
  return `'${s.replace(/'/g, "''")}'`;
}

export function searchVectorDdl(): string {
  const fields = SEARCH_FIELD_PATHS.map(
    (path) => `setweight(jsonb_to_tsvector('simple', coalesce(jsonb_path_query_array(entity, ${literal(path)}), '[]'::jsonb), '["string"]'), '${WEIGHT.field}')`
  );
  return [
    `setweight(to_tsvector('simple', label), '${WEIGHT.title}')`,
    `setweight(to_tsvector('simple', coalesce(description, '')), '${WEIGHT.description}')`,
    ...fields,
  ].join(' || ');
}
