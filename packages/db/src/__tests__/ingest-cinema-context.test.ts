/**
 * Cinema Context ingestion: a programme is an event at its cinema's point, resolved
 * to the era-appropriate address (Adamlink before 1943, BAG after), grouped by the
 * venue's permanent id, linked to its source page when it has a permanent id, dated
 * at the source's precision, labelled with the venue's name, and carrying its bill as
 * a ScreeningEvent entity.
 * Fixture: four programmes of one cinema and one with an unparseable date.
 */
import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { sql } from 'drizzle-orm';
import { resolve } from 'path';
import type { ScreeningEventEntity } from '@atm/shared';
import { setupTestDb, cleanTestDb, teardownTestDb, db } from './setup';
import { parseProgrammeDate } from '../etl/sources/cinema-context';

type Row = { id: string; url: string; label: string; record_type: string; group_key: string | null; start: string; end: string; entity: ScreeningEventEntity };

describe('cinema-context ingestion', () => {
  beforeAll(async () => {
    await setupTestDb();
    await cleanTestDb();
    await db.execute(sql`INSERT INTO organisations (id, label) VALUES ('adamlink', 'Adamlink'), ('bag', 'BAG')`);
    // the cinema's address in both eras, at the same point
    await db.execute(sql`INSERT INTO place (id, type, source, name) VALUES
      ('cc-lp', 'address', 'adamlink', 'Ceintuurbaan 338'),
      ('cc-bag', 'address', 'bag', 'Ceintuurbaan 338')`);
    await db.execute(sql`INSERT INTO place_geometry (place_id, geometry) VALUES
      ('cc-lp', ST_Transform(ST_GeomFromText('POINT(4.9 52.37)', 4326), 28992)),
      ('cc-bag', ST_Transform(ST_GeomFromText('POINT(4.9 52.37)', 4326), 28992))`);
    const { ingest } = await import('../etl/sources/cinema-context');
    await ingest(resolve(__dirname, 'fixtures/cinema-context.jsonl'));
  });

  afterAll(async () => {
    await cleanTestDb();
    await teardownTestDb();
  });

  async function rows(): Promise<Row[]> {
    const r = await db.execute<Row>(sql`
      SELECT id, url, label, record_type, group_key, start_date::text AS start, end_date::text AS end, entity
      FROM features ORDER BY start_date`);
    return r.rows;
  }

  test('every parseable programme becomes an event; the malformed date is skipped', async () => {
    const all = await rows();
    expect(all.length).toBe(4);
    expect(all.every((f) => f.record_type === 'event')).toBe(true);
    expect(all.every((f) => f.group_key === 'B000001')).toBe(true);
  });

  test('a programme resolves to the address of its era', async () => {
    const r = await db.execute<{ start: string; place_id: string }>(sql`
      SELECT f.start_date::text AS start, fp.place_id FROM features f JOIN feature_to_place fp ON fp.feature_id = f.id ORDER BY f.start_date`);
    const byStart = new Map(r.rows.map((x) => [x.start, x.place_id]));
    expect(byStart.get('1934-01-05')).toBe('cc-lp');
    expect(byStart.get('1960-03-04')).toBe('cc-bag');
  });

  test('the label is the cinema; the period follows the date at source precision', async () => {
    const all = await rows();
    expect(all.every((f) => f.label === 'Rialto')).toBe(true);
    const month = all.find((f) => f.entity.startDate === '1907-05')!;
    expect(month.start).toBe('1907-05-01');
    expect(month.end).toBe('1907-05-31');
    const day = all.find((f) => f.entity.startDate === '1934-01-05')!;
    expect(day.start).toBe('1934-01-05');
    expect(day.end).toBe('1934-01-05');
  });

  test('the source link comes from the permanent id; a programme without one has none', async () => {
    const all = await rows();
    expect(all.find((f) => f.start === '1934-01-05')!.url).toBe('https://cinemacontext.nl/id/V000001');
    const unlinked = all.find((f) => f.start === '1934-01-12')!;
    expect(unlinked.url).toBe('');
    expect(unlinked.entity.id).toBeUndefined();
  });

  test('the entity is a ScreeningEvent at a MovieTheater with its bill, acts and sources', async () => {
    const all = await rows();
    const first = all.find((f) => f.start === '1934-01-05')!.entity;
    expect(first.type).toBe('ScreeningEvent');
    expect(first.id).toBe('V000001');
    expect(first.alternateName).toBe('jeugdbioscoop');
    expect(first.location).toEqual({ type: 'MovieTheater', name: 'Rialto', identifier: 'B000001', additionalType: 'Cinema', address: 'Ceintuurbaan 338-340' });
    expect(first.workPresented).toEqual([{ type: 'Movie', name: 'Skippy (1931)', url: 'https://cinemacontext.nl/id/F000001', dateCreated: '1931', countryOfOrigin: 'USA' }]);
    expect(first.citation).toEqual(['Telegraaf']);
    expect(first.performer).toBeUndefined();
    const second = all.find((f) => f.start === '1960-03-04')!.entity;
    expect(second.alternateName).toBeUndefined();
    expect(second.workPresented.map((m) => m.name)).toEqual(['Can-can (1960)']);
    expect(second.performer).toBe('Mello Wendini, komisch dressuur act');
    expect(second.citation).toEqual(['Telegraaf', 'Het Parool']);
  });

  test('the venue takes the Schema.org type the export named and keeps its source wording', async () => {
    const { ScreeningEventEntityFactory } = await import('../etl/ingest/entity-factory');
    const factory = new ScreeningEventEntityFactory();
    const draft = { id: 'x', url: '', label: 'x', description: '', startDate: '1934-01-05', endDate: '1934-01-05' };
    const venues = [
      ['Cinema', 'MovieTheater', 'MovieTheater'],
      ['Theater', 'PerformingArtsTheater', 'PerformingArtsTheater'],
      ['Zaal', 'EventVenue', 'EventVenue'],
      ['Other', 'Castle', 'EventVenue'],
      ['Other', undefined, 'EventVenue'],
    ];
    for (const [kind, named, expected] of venues) {
      const entity = factory.create(draft, new Map<string, unknown>([['venue', { name: 'V', perm_id: 'B1', type: kind, schema_type: named }], ['items', []], ['sources', []]]));
      expect(entity.location.type).toBe(expected as 'MovieTheater');
      expect(entity.location.additionalType).toBe(kind);
    }
  });

  test('date parsing keeps the source precision and rejects what it cannot read', () => {
    expect(parseProgrammeDate('1934-01-05')).toEqual({ startDate: '1934-01-05', endDate: '1934-01-05' });
    expect(parseProgrammeDate('1907-05-xx')).toEqual({ startDate: '1907-05-01', endDate: '1907-05-31' });
    expect(parseProgrammeDate('1928-xx-xx')).toEqual({ startDate: '1928-01-01', endDate: '1928-12-31' });
    expect(parseProgrammeDate('1910-01-174')).toBeNull();
    expect(parseProgrammeDate('1934-02-30')).toBeNull();
    expect(parseProgrammeDate(null)).toBeNull();
  });
});
