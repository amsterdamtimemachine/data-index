/** The relation line's dated place name: observations for addresses, windows for streets. */
import { describe, test, expect, beforeAll, afterAll, beforeEach } from 'bun:test';
import { sql } from 'drizzle-orm';
import { setupTestDb, cleanTestDb, teardownTestDb, db } from './setup';
import { historicalLabelSql } from '../queries/historical-label';

async function place(id: string, type: string, name: string) {
  await db.execute(sql`INSERT INTO agents (id, label) VALUES ('adamlink', 'Adamlink') ON CONFLICT (id) DO NOTHING`);
  await db.execute(sql`INSERT INTO place (id, type, source, name) VALUES (${id}, ${type}, 'adamlink', ${name})`);
}
async function name(id: string, placeId: string, label: string, since: string | null, until: string | null) {
  await db.execute(sql`INSERT INTO place_historical_name (id, place_id, name, since, until) VALUES (${id}, ${placeId}, ${label}, ${since}, ${until})`);
}
async function labelAt(placeId: string, type: string, date: string): Promise<string | null> {
  const r = await db.execute<{ label: string | null }>(sql`
    SELECT ${historicalLabelSql(sql`${placeId}`, sql`${type}`, sql`${date}::date`, sql`${date}::date`)} AS label`);
  return r.rows[0].label;
}

describe('historical label', () => {
  beforeAll(setupTestDb);
  afterAll(async () => { await cleanTestDb(); await teardownTestDb(); });
  beforeEach(cleanTestDb);

  test('a street shows the name whose window holds the date, else none', async () => {
    await place('dam', 'street', 'Dam');
    await name('n1', 'dam', 'Revolutieplein', '1795-01-01', '1806-01-01');
    await name('n2', 'dam', 'Napoleonplein', '1806-01-01', '1813-01-01');
    await name('n3', 'dam', 'Dam', '1957-01-01', null);
    await name('n4', 'dam', 'Den Dam', null, null);
    await name('n5', 'dam', 'de Plaetse', null, '1600-01-01');
    expect(await labelAt('dam', 'street', '1500-06-01')).toBe('de Plaetse');
    expect(await labelAt('dam', 'street', '1800-06-01')).toBe('Revolutieplein');
    expect(await labelAt('dam', 'street', '1810-06-01')).toBe('Napoleonplein');
    expect(await labelAt('dam', 'street', '1940-06-01')).toBeNull();
    expect(await labelAt('dam', 'street', '1960-06-01')).toBe('Dam');
  });

  test('an address shows its latest observation at or before the date', async () => {
    await place('lp', 'address', 'Kalverstraat 97');
    await name('o1', 'lp', 'E 52', '1853-01-01', '1853-12-31');
    await name('o2', 'lp', 'Kalverstraat 97', '1876-01-01', '1876-12-31');
    expect(await labelAt('lp', 'address', '1860-06-01')).toBe('E 52');
    expect(await labelAt('lp', 'address', '1903-03-09')).toBe('Kalverstraat 97');
    expect(await labelAt('lp', 'address', '1840-01-01')).toBeNull();
  });
});
