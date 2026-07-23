/**
 * getGridConfig's missing-row policy: it throws (rather than returning zeros) so a
 * forgotten rebuild-index surfaces loudly. Kept in its own file because it needs an
 * empty grid_config, and the shared test DB makes a seeding describe in the same
 * file clobber it (setupTestDb drops+recreates → empty).
 */
import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { setupTestDb, teardownTestDb } from './setup';
import { getGridConfig } from '../queries/grid-config';

describe('grid_config: not built yet', () => {
  beforeAll(async () => {
    await setupTestDb(); // drops + recreates → grid_config exists but is empty
  });
  afterAll(async () => {
    await teardownTestDb();
  });

  test('getGridConfig throws when rebuild-index has not run', async () => {
    await expect(getGridConfig()).rejects.toThrow();
  });
});
