/**
 * The out-of-period count in the ingest summary: links to a place whose period
 * excludes the feature's date. A period's until is exclusive; a place without a
 * period (an address) never counts; another dataset's links are not this one's.
 */
import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { sql } from 'drizzle-orm';
import { setupTestDb, cleanTestDb, teardownTestDb, db } from './setup';
import { upsertSource } from '../etl/writers/feature-writer';
import { countOutOfPeriodLinks } from '../etl/ingest/link-audit';

const F = (n: number) => `44444444-4444-4444-4444-44444444440${n}`;
const LINE = 'LINESTRING(120150.5 485050.5, 120250.5 485050.5)';

async function street(id: string, since: string | null, until: string | null) {
  await db.execute(sql`INSERT INTO place (id, type, source, name) VALUES (${id}, 'street', 'adamlink', ${id})`);
  await db.execute(sql`INSERT INTO place_geometry (place_id, geometry, since, until)
    VALUES (${id}, ST_GeomFromText(${LINE}, 28992), ${since}::date, ${until}::date)`);
}
async function link(feature: string, dataset: string, place: string) {
  await db.execute(sql`INSERT INTO features (id, record_type, label, start_date, end_date, dataset_id)
    VALUES (${feature}, 'text', ${feature}, '1890-06-01', '1890-06-01', ${dataset})`);
  await db.execute(sql`INSERT INTO feature_to_place (feature_id, place_id, relation_id) VALUES (${feature}, ${place}, 'mentions')`);
}

describe('countOutOfPeriodLinks', () => {
  beforeAll(async () => {
    await setupTestDb();
    await cleanTestDb();
    await db.execute(sql`INSERT INTO agents (id, label) VALUES ('adamlink', 'Adamlink') ON CONFLICT (id) DO NOTHING`);
    for (const id of ['la-ds', 'la-other']) {
      await upsertSource({
        provider: { id: 'la-org', label: 'LA Org' },
        dataset: { id, label: id },
        relations: [{ id: 'mentions', label: 'Mentions' }],
      });
    }
    await street('not-yet', '1965-01-01', null);
    await street('gone', '1850-01-01', '1890-01-01');
    await street('standing', '1850-01-01', '1900-01-01');
    await street('undated', null, null);
    await db.execute(sql`INSERT INTO place (id, type, source, name) VALUES ('addr', 'address', 'adamlink', 'Ergens 1')`);
    await db.execute(sql`INSERT INTO place_geometry (place_id, geometry) VALUES ('addr', ST_GeomFromText('POINT(120050.5 485050.5)', 28992))`);

    await link(F(1), 'la-ds', 'not-yet');
    await link(F(2), 'la-ds', 'gone');
    await link(F(3), 'la-ds', 'standing');
    await link(F(4), 'la-ds', 'undated');
    await link(F(5), 'la-ds', 'addr');
    await link(F(6), 'la-other', 'not-yet');
  });

  afterAll(async () => {
    await cleanTestDb();
    await teardownTestDb();
  });

  test('counts the links to a place not yet built or already gone, for the dataset alone', async () => {
    expect(await countOutOfPeriodLinks('la-ds')).toBe(2);
    expect(await countOutOfPeriodLinks('la-other')).toBe(1);
    expect(await countOutOfPeriodLinks('la-none')).toBe(0);
  });
});
