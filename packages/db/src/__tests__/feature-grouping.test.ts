/**
 * Grouped feature list: a dataset's features sharing a group key are one row,
 * spanning its members in the population, with the years and counts the card's
 * strip needs; ungrouped features stay their own row. getGroupFeatures returns
 * one group's members in a window, in date order.
 *
 * The index counts a group once too: members share the group's smallest id in the
 * cell, tag and search bitmaps, so the histogram and the place search agree with
 * the list.
 *
 * Fixture: one cinema (B1) with four programmes over 1934 and 1960, a second
 * cinema (B2) with one programme, and an ungrouped text feature.
 */
import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { sql } from 'drizzle-orm';
import type { EventSeriesEntity } from '@atm/shared';
import { setupTestDb, cleanTestDb, teardownTestDb, db } from './setup';
import { rebuildIndex } from '../etl/post-process/rebuild-index';
import { getFeatures } from '../queries/features';
import { getGroupFeatures } from '../queries/group-features';
import { getGridConfig } from '../queries/grid-config';
import { computeTimeSlices } from '../queries/time-slices';
import { getHistogram } from '../queries/histogram';
import { searchPlaces } from '../queries/place-search';

const VENUE = { type: 'MovieTheater' as const, name: 'Rialto', identifier: 'B1', additionalType: 'Cinema' };

async function programme(id: string, key: string, name: string, date: string, title: string) {
  const entity = { type: 'ScreeningEvent', name, startDate: date, location: { ...VENUE, name, identifier: key }, workPresented: [{ type: 'Movie', name: title }] };
  await db.execute(sql`
    INSERT INTO features (id, record_type, label, url, start_date, end_date, dataset_id, group_key, entity)
    VALUES (${id}::uuid, 'event', ${name}, ${`https://example.org/${id.slice(0, 8)}`}, ${date}::date, ${date}::date, 'cc', ${key}, ${JSON.stringify(entity)}::jsonb)`);
  await db.execute(sql`INSERT INTO feature_to_place (feature_id, place_id, relation_id) VALUES (${id}::uuid, 'p1', 'isAbout')`);
}

const P1 = '11111111-1111-4111-8111-111111111111';
const P2 = '22222222-2222-4222-8222-222222222222';
const P3 = '33333333-3333-4333-8333-333333333333';
const P4 = '44444444-4444-4444-8444-444444444444';
const P5 = '55555555-5555-4555-8555-555555555555';
const T1 = '66666666-6666-4666-8666-666666666666';

async function list(opts: { timeSlice?: string; sort?: 'sample' | 'date'; seed?: string } = {}) {
  const cfg = await getGridConfig();
  return getFeatures({
    area: { kind: 'bounds', bounds: { minLon: cfg.minLon, maxLon: cfg.maxLon, minLat: cfg.minLat, maxLat: cfg.maxLat } },
    recordTypes: ['event', 'text'],
    sort: opts.sort ?? 'date',
    sortDirection: 'asc',
    seed: opts.seed,
    timeSlice: opts.timeSlice,
    pageSize: 100,
  });
}

describe('feature grouping', () => {
  beforeAll(async () => {
    await setupTestDb();
    await cleanTestDb();
    await db.execute(sql`INSERT INTO organisations (id, label) VALUES ('adamlink', 'A')`);
    await db.execute(sql`INSERT INTO datasets (id, label) VALUES ('cc', 'Cinema Context'), ('dsT', 'Texts')`);
    await db.execute(sql`INSERT INTO relation (id, label) VALUES ('isAbout', 'About') ON CONFLICT (id) DO NOTHING`);
    await db.execute(sql`INSERT INTO place (id, type, source, name) VALUES ('p1', 'address', 'adamlink', 'Amstel 1')`);
    await db.execute(sql`INSERT INTO place_geometry (place_id, geometry) VALUES ('p1', ST_GeomFromText('POINT(120000 485000)', 28992))`);

    await programme(P1, 'B1', 'Rialto', '1934-01-05', 'Skippy');
    await programme(P2, 'B1', 'Rialto', '1934-01-12', 'Song of songs');
    await programme(P3, 'B1', 'Rialto', '1934-01-05', 'Bedtime story');
    await programme(P4, 'B1', 'Rialto', '1960-03-04', 'Can-can');
    await programme(P5, 'B2', 'Luxor', '1934-02-02', 'Weg naar het hart');
    await db.execute(sql`
      INSERT INTO features (id, record_type, label, start_date, end_date, dataset_id)
      VALUES (${T1}::uuid, 'text', 'Een krant', '1934-06-01'::date, '1934-06-01'::date, 'dsT')`);
    await db.execute(sql`INSERT INTO feature_to_place (feature_id, place_id, relation_id) VALUES (${T1}::uuid, 'p1', 'isAbout')`);

    await rebuildIndex();
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  test('a group is one row spanning its members; ungrouped features are their own row', async () => {
    const result = await list();
    expect(result.total).toBe(3);
    expect(result.data.map((f) => f.label)).toEqual(['Rialto', 'Luxor', 'Een krant']);
    const rialto = result.data[0];
    expect(rialto.id).toBe(P1);
    expect(rialto.url).toBeUndefined();
    expect(rialto.dateRange).toEqual([1934, 1960]);
    const text = result.data[2];
    expect(text.url).toBeUndefined();
    expect(text.entity).toBeUndefined();
  });

  test('the group row is an EventSeries with the venue and the years with counts', async () => {
    const result = await list();
    const entity = result.data[0].entity as EventSeriesEntity;
    expect(entity.type).toBe('EventSeries');
    expect(entity.name).toBe('Rialto');
    expect(entity.location).toEqual({ ...VENUE, name: 'Rialto', identifier: 'B1' });
    expect(entity.startDate).toBe('1934-01-05');
    expect(entity.endDate).toBe('1960-03-04');
    expect(entity.years).toEqual([{ year: 1934, count: 3 }, { year: 1960, count: 1 }]);
  });

  test('the span and the years follow the period', async () => {
    const slices = await computeTimeSlices();
    const result = await list({ timeSlice: slices[0].key });
    const rialto = result.data.find((f) => f.label === 'Rialto')!;
    expect(rialto.dateRange).toEqual([1934, 1934]);
    expect((rialto.entity as EventSeriesEntity).years).toEqual([{ year: 1934, count: 3 }]);
  });

  test('the sample order is stable per seed', async () => {
    const a = await list({ sort: 'sample', seed: 'x' });
    const b = await list({ sort: 'sample', seed: 'x' });
    expect(a.data.map((f) => f.id)).toEqual(b.data.map((f) => f.id));
    expect(a.total).toBe(3);
  });

  test('getGroupFeatures returns the members of a window in date order', async () => {
    const year = await getGroupFeatures({ datasetId: 'cc', groupKey: 'B1', start: '1934-01-01', end: '1934-12-31' });
    expect(year.data.map((f) => f.startDate)).toEqual(['1934-01-05', '1934-01-05', '1934-01-12']);
    expect(year.data[0].url).toBe(`https://example.org/${P1.slice(0, 8)}`);
    expect(year.data[0].entity?.type).toBe('ScreeningEvent');
    const none = await getGroupFeatures({ datasetId: 'cc', groupKey: 'B1', start: '1950-01-01', end: '1950-12-31' });
    expect(none.data).toEqual([]);
  });

  test('the index counts a group once: histogram and place search agree with the list', async () => {
    const all = await getHistogram(['event', 'text'], undefined, undefined, 50);
    expect(all.totalFeatures).toBe(3);
    const rialto = await getHistogram(['event', 'text'], undefined, undefined, 50, undefined, undefined, { searchQuery: 'Rialto' });
    expect(rialto.totalFeatures).toBe(1);
    const places = await searchPlaces('Amstel 1', { limit: 5 });
    expect(places[0].featureCount).toBe(3);
  });
});
