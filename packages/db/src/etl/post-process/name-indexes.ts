/**
 * The place name indexes kept in step with the schema: they were partial (WHERE name
 * IS NOT NULL) once, and the planner does not read a partial index's statistics, so
 * it estimated 0.5% of all places for every name and ran each lookup as a parallel
 * scan. The schema declares them without the predicate now, but drizzle-kit push
 * cannot see the difference on an existing database, so rebuild-index drops the
 * predicate where it still is: each such index is recreated from its own definition
 * with the WHERE clause removed.
 */
import { sql } from 'drizzle-orm';
import { db } from '../../client';

const NAME_INDEXES = ['idx_place_name_lower', 'idx_place_name_prefix', 'idx_place_historical_name_lower', 'idx_place_historical_name_prefix'];

type IndexRow = { indexname: string; indexdef: string };

export async function ensureNameIndexes(): Promise<string[]> {
  const partial = await db.execute<IndexRow>(sql`
    SELECT indexname, indexdef FROM pg_indexes
    WHERE schemaname = current_schema() AND indexname IN ${NAME_INDEXES} AND indexdef LIKE '% WHERE %'
  `);
  for (const row of partial.rows) {
    const definition = row.indexdef.replace(/ WHERE .*$/s, '');
    await db.execute(sql.raw(`DROP INDEX ${row.indexname}`));
    await db.execute(sql.raw(definition));
  }
  if (partial.rows.length > 0) {
    await db.execute(sql`ANALYZE place`);
    await db.execute(sql`ANALYZE place_historical_name`);
  }
  return partial.rows.map((r) => r.indexname);
}
