/**
 * The text search column, built from what the index already holds: the title, the
 * description and the entity's searchable values (SEARCH_FIELDS). Words as written
 * (the `simple` configuration: lowercased, nothing stemmed, nothing dropped), so a
 * name matches itself and not a lookalike. One expression for the schema's generated
 * column and the test DDL, as DDL text: a generated column takes no parameters.
 */
import { SEARCH_FIELD_PATHS } from '@atm/shared';

function literal(s: string): string {
  return `'${s.replace(/'/g, "''")}'`;
}

export function searchVectorDdl(): string {
  const fields = SEARCH_FIELD_PATHS.map(
    (path) => `jsonb_to_tsvector('simple', coalesce(jsonb_path_query_array(entity, ${literal(path)}), '[]'::jsonb), '["string"]')`
  );
  return [`to_tsvector('simple', label)`, `to_tsvector('simple', coalesce(description, ''))`, ...fields].join(' || ');
}
