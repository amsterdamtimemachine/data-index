import { sql, type SQL } from 'drizzle-orm';

/**
 * Optional `AND <col> IN (...)` predicate — empty SQL when the list is absent or
 * empty, so an inactive filter contributes nothing to the WHERE clause.
 * Centralises the "no values → no filter" rule every query repeated inline.
 */
export function andIn(col: SQL, values: string[] | undefined): SQL {
  return values && values.length > 0 ? sql`AND ${col} IN ${values}` : sql``;
}
