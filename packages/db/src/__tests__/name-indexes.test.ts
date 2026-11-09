/**
 * The place name indexes follow the schema: rebuild-index recreates a partial one
 * without its predicate, and leaves one that already matches alone.
 */
import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { sql } from 'drizzle-orm';
import { setupTestDb, cleanTestDb, teardownTestDb, db } from './setup';
import { ensureNameIndexes } from '../etl/post-process/name-indexes';

async function definition(name: string): Promise<string> {
  const res = await db.execute<{ indexdef: string }>(sql`SELECT indexdef FROM pg_indexes WHERE indexname = ${name}`);
  return res.rows[0].indexdef;
}

describe('name index upkeep', () => {
  beforeAll(async () => {
    await setupTestDb();
    await cleanTestDb();
  });
  afterAll(async () => {
    await cleanTestDb();
    await teardownTestDb();
  });

  test('a partial name index is recreated without its predicate; a plain one is left alone', async () => {
    await db.execute(sql`DROP INDEX idx_place_name_lower`);
    await db.execute(sql`CREATE INDEX idx_place_name_lower ON place USING btree (lower(name)) WHERE name IS NOT NULL`);
    expect(await definition('idx_place_name_lower')).toContain('WHERE');
    expect(await ensureNameIndexes()).toEqual(['idx_place_name_lower']);
    expect(await definition('idx_place_name_lower')).toBe('CREATE INDEX idx_place_name_lower ON public.place USING btree (lower(name))');
    expect(await ensureNameIndexes()).toEqual([]);
  });
});
