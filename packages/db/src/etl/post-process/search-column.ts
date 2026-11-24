/**
 * The text search column kept in step with the code: a generated column's expression
 * is table definition, which neither an ingest nor drizzle-kit push (which cannot see
 * the expression change) touches. The expression the column was built with is kept as
 * the column's comment; when it differs from searchVectorDdl(), the column and its
 * index are rebuilt. Part of rebuild-index, so every machine gets it the same way.
 */
import { sql } from 'drizzle-orm';
import { db } from '../../client';
import { searchVectorDdl } from '../../search-vector';

const INDEX = 'idx_features_search_fts';

export async function ensureSearchColumn(): Promise<boolean> {
  const ddl = searchVectorDdl();
  const current = await db.execute<{ comment: string | null }>(sql`
    SELECT col_description('features'::regclass, attnum) AS comment
    FROM pg_attribute WHERE attrelid = 'features'::regclass AND attname = 'search_tsv' AND NOT attisdropped
  `);
  if (current.rows[0]?.comment === ddl) {
    return false;
  }
  await db.transaction(async (tx) => {
    await tx.execute(sql`SET LOCAL statement_timeout = 0`);
    await tx.execute(sql.raw(`DROP INDEX IF EXISTS ${INDEX}`));
    await tx.execute(sql`ALTER TABLE features DROP COLUMN IF EXISTS search_tsv`);
    await tx.execute(sql.raw(`ALTER TABLE features ADD COLUMN search_tsv tsvector GENERATED ALWAYS AS (${ddl}) STORED`));
    await tx.execute(sql.raw(`CREATE INDEX ${INDEX} ON features USING gin (search_tsv)`));
    // COMMENT ON takes no parameter, so the text goes in as a quoted literal
    await tx.execute(sql.raw(`COMMENT ON COLUMN features.search_tsv IS '${ddl.replace(/'/g, "''")}'`));
  });
  return true;
}
