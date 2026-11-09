/**
 * The text search column follows the code: rebuild-index recreates it when the
 * expression it was built with differs from searchVectorDdl(), and leaves it alone
 * otherwise.
 */
import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { sql } from 'drizzle-orm';
import { setupTestDb, cleanTestDb, teardownTestDb, db } from './setup';
import { ensureSearchColumn } from '../etl/post-process/search-column';
import { searchVectorDdl } from '../search-vector';

async function column() {
  const res = await db.execute<{ expr: string; comment: string | null }>(sql`
    SELECT pg_get_expr(d.adbin, d.adrelid) AS expr, col_description(a.attrelid, a.attnum) AS comment
    FROM pg_attribute a JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
    WHERE a.attrelid = 'features'::regclass AND a.attname = 'search_tsv'
  `);
  return res.rows[0];
}

describe('search column upkeep', () => {
  beforeAll(async () => {
    await setupTestDb();
    await cleanTestDb();
  });
  afterAll(async () => {
    await cleanTestDb();
    await teardownTestDb();
  });

  test('a column without the code\'s stamp is rebuilt and stamped; a stamped one is left alone', async () => {
    await db.execute(sql`COMMENT ON COLUMN features.search_tsv IS 'an older expression'`);
    expect(await ensureSearchColumn()).toBe(true);
    const built = await column();
    expect(built.comment).toBe(searchVectorDdl());
    expect(built.expr).toContain("'simple'::regconfig");
    expect(await ensureSearchColumn()).toBe(false);
    const index = await db.execute<{ n: string }>(sql`SELECT count(*) AS n FROM pg_indexes WHERE indexname = 'idx_features_search_fts'`);
    expect(parseInt(index.rows[0].n)).toBe(1);
  });
});
