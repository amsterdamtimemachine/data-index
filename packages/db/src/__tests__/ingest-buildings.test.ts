/**
 * Adamlink buildings: a footprint, or a point for a vanished building; build and
 * demolition years as a lifespan, an unknown year left open; names as a street's, but
 * the index keeps the source's label as the name; the BAG building id; only within
 * the municipality boundary. Fixtures: six buildings cut from the Adamlink gebouwen
 * file, one of them in Amstelveen, and a boundary box over Amsterdam that stops
 * short of it.
 */
import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { sql } from 'drizzle-orm';
import { resolve } from 'path';
import { setupTestDb, cleanTestDb, teardownTestDb, db } from './setup';
import { rebuildIndex } from '../etl/post-process/rebuild-index';

const FIXTURE = resolve(__dirname, 'fixtures/adamlink-gebouwen.ttl');
const MUNICIPALITY = resolve(__dirname, 'fixtures/municipality.geojson');
const B = 'https://adamlink.nl/geo/building/';
const GAS = `${B}oostergasfabriek/242`;
const HAASJE = `${B}t-haasje/713`;
const ROYAAL = `${B}plaats-royaal/437`;
const ZEEMAGAZIJN = `${B}scheepvaartmuseum/343`;
const AALMOEZENIERS = `${B}aalmoezeniershuis/1249`;
const AMSTELVEEN = `${B}metrostation-amstelveen-centrum/1201`;

type Row = { id: string; name: string; gtype: string; since: string | null; until: string | null; building_id: string | null };

describe('buildings ingestion', () => {
  beforeAll(async () => {
    await setupTestDb();
    await cleanTestDb();
    await db.execute(sql`INSERT INTO agents (id, label) VALUES ('adamlink', 'Adamlink')`);
    const { ingest } = await import('../etl/sources/buildings');
    await ingest(FIXTURE, { municipality: MUNICIPALITY });
    await rebuildIndex();
  });

  afterAll(async () => {
    await cleanTestDb();
    await teardownTestDb();
  });

  async function buildings(): Promise<Record<string, Row>> {
    const r = await db.execute<Row>(sql`
      SELECT p.id, p.name, GeometryType(pg.geometry) AS gtype, pg.since::text, pg.until::text, pg.building_id
      FROM place p JOIN place_geometry pg ON pg.place_id = p.id WHERE p.type = 'building'`);
    return Object.fromEntries(r.rows.map((row) => [row.id, row]));
  }

  test('a building within the municipality is a place with its footprint or point; outside it is left out', async () => {
    const all = await buildings();
    expect(Object.keys(all).sort()).toEqual([AALMOEZENIERS, GAS, ROYAAL, ZEEMAGAZIJN, HAASJE].sort());
    expect(all[AMSTELVEEN]).toBeUndefined();
    expect(all[GAS].gtype).toBe('POLYGON');
    expect(all[HAASJE].gtype).toBe('POINT');
  });

  test('its lifespan: the build year, and the year after its demolition; an unknown year stays open', async () => {
    const all = await buildings();
    expect([all[GAS].since, all[GAS].until]).toEqual(['1887-01-01', null]);
    expect([all[HAASJE].since, all[HAASJE].until]).toEqual([null, '1925-01-01']);
    expect([all[ROYAAL].since, all[ROYAAL].until]).toEqual([null, null]);
  });

  test('its BAG building id, when Adamlink links one', async () => {
    const all = await buildings();
    expect(all[GAS].building_id).toBe('0363100012236879');
    expect(all[HAASJE].building_id).toBeNull();
  });

  test('its names as a street has them, while the index keeps the source label as its name', async () => {
    const all = await buildings();
    expect(all[ZEEMAGAZIJN].name).toBe("'s Lands Zeemagazijn");
    const r = await db.execute<{ name: string; since: string | null; until: string | null; source: string }>(sql`
      SELECT name, since::text, until::text, source FROM place_historical_name WHERE place_id = ${ZEEMAGAZIJN} ORDER BY name`);
    expect(r.rows).toContainEqual({ name: 'Scheepvaartmuseum', since: '1973-01-01', until: null, source: 'adamlink-gebouwen' });
    expect(r.rows).toContainEqual({ name: 'Admiraliteitsmagazijn', since: null, until: null, source: 'adamlink-gebouwen' });
    const uses = await db.execute<{ name: string; since: string | null; until: string | null }>(sql`
      SELECT name, since::text, until::text FROM place_historical_name WHERE place_id = ${AALMOEZENIERS} AND since IS NOT NULL ORDER BY since`);
    expect(uses.rows).toEqual([
      { name: 'Aalmoezeniershuis', since: '1613-01-01', until: '1666-01-01' },
      { name: 'Latijnsche School', since: '1666-01-01', until: '1885-01-01' },
    ]);
  });
});
