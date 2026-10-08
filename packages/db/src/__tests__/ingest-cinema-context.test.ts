/**
 * Cinema Context ingestion: a programme with a film is a ScreeningEvent screened at
 * its venue, one with acts only a TheaterEvent performed there; an empty bill or an
 * unreadable date is skipped. The label is the first item on the bill. The place is
 * the venue's address matched by name, with the point as fallback.
 *
 * Fixture: two programmes at a named address (one with an act before its film), one
 * at an address written as a range, an acts-only programme without a permanent id,
 * one with a malformed date and one with an empty bill.
 */
import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { sql } from 'drizzle-orm';
import { resolve } from 'path';
import type { ScreeningEventEntity, TheaterEventEntity } from '@atm/shared';
import { setupTestDb, cleanTestDb, teardownTestDb, db } from './setup';
import { parseProgrammeDate } from '../etl/sources/cinema-context';

type Row = { id: string; url: string; label: string; record_type: string; start: string; end: string; entity: ScreeningEventEntity | TheaterEventEntity; place_id: string; relation_id: string };

describe('cinema-context ingestion', () => {
  beforeAll(async () => {
    await setupTestDb();
    await cleanTestDb();
    await db.execute(sql`INSERT INTO agents (id, label) VALUES ('adamlink', 'Adamlink')`);
    // the address by its name, and an address of the era at the venue's point
    await db.execute(sql`INSERT INTO place (id, type, source, name) VALUES
      ('cc-named', 'address', 'adamlink', 'Ceintuurbaan 338'),
      ('cc-point', 'address', 'adamlink', 'Ceintuurbaan 340')`);
    await db.execute(sql`INSERT INTO place_geometry (place_id, geometry) VALUES
      ('cc-named', ST_Transform(ST_GeomFromText('POINT(4.95 52.35)', 4326), 28992)),
      ('cc-point', ST_Transform(ST_GeomFromText('POINT(4.9 52.37)', 4326), 28992))`);
    const { ingest } = await import('../etl/sources/cinema-context');
    await ingest(resolve(__dirname, 'fixtures/cinema-context.jsonl'));
  });

  afterAll(async () => {
    await cleanTestDb();
    await teardownTestDb();
  });

  async function rows(): Promise<Row[]> {
    const r = await db.execute<Row>(sql`
      SELECT f.id, f.url, f.label, f.record_type, f.start_date::text AS start, f.end_date::text AS end, f.entity,
             fp.place_id, fp.relation_id
      FROM features f JOIN feature_to_place fp ON fp.feature_id = f.id ORDER BY f.start_date`);
    return r.rows;
  }

  test('a programme needs a bill and a readable date', async () => {
    const all = await rows();
    expect(all.length).toBe(4);
    expect(all.every((f) => f.record_type === 'event')).toBe(true);
  });

  test('the label is the first item on the bill, film or act', async () => {
    const all = await rows();
    expect(all.find((f) => f.start === '1934-01-05')!.label).toBe('Skippy (1931)');
    expect(all.find((f) => f.start === '1960-03-04')!.label).toBe('Mello Wendini, komisch dressuur act');
    expect(all.find((f) => f.start === '1934-01-12')!.label).toBe('Allison Troep, acrobaten');
  });

  test('the address matches by name; a range falls back to the point', async () => {
    const all = await rows();
    expect(all.find((f) => f.start === '1934-01-05')!.place_id).toBe('cc-named');
    expect(all.find((f) => f.start === '1907-05-01')!.place_id).toBe('cc-point');
  });

  test('a film makes a screening screened at the venue; acts only a theatre event performed there', async () => {
    const all = await rows();
    const mixed = all.find((f) => f.start === '1960-03-04')!;
    expect(mixed.entity.type).toBe('ScreeningEvent');
    expect(mixed.relation_id).toBe('screenedAt');
    const acts = all.find((f) => f.start === '1934-01-12')!;
    expect(acts.entity.type).toBe('TheaterEvent');
    expect(acts.relation_id).toBe('performedAt');
  });

  test('both relations are dated: the card words a programme\'s date with its place', async () => {
    const r = await db.execute<{ id: string; dated: boolean }>(sql`SELECT id, dated FROM relation ORDER BY id`);
    expect(r.rows).toEqual([{ id: 'performedAt', dated: true }, { id: 'screenedAt', dated: true }]);
  });

  test('the entity carries the venue as the source has it, the bill and the newspapers', async () => {
    const all = await rows();
    const mixed = all.find((f) => f.start === '1960-03-04')!.entity;
    expect(mixed.id).toBe('V000002');
    expect(mixed.name).toBe('Mello Wendini, komisch dressuur act');
    expect(mixed.location).toEqual({ type: 'Place', name: 'Rialto', identifier: 'B000001', additionalType: 'Cinema', address: 'Ceintuurbaan 338' });
    expect(mixed.workPresented).toEqual([{ type: 'Movie', name: 'Can-can (1960)', url: 'https://cinemacontext.nl/id/F000002', dateCreated: '1960', countryOfOrigin: 'USA' }]);
    expect(mixed.performer).toEqual(['Mello Wendini, komisch dressuur act']);
    expect(mixed.citation).toEqual(['Telegraaf', 'Het Parool']);
    const acts = all.find((f) => f.start === '1934-01-12')!;
    expect(acts.url).toBe('');
    expect(acts.entity.workPresented).toEqual([]);
    expect(acts.entity.performer).toEqual(['Allison Troep, acrobaten', 'Alfonso Avello Combination, pantomime']);
  });

  test('dates keep the source precision', async () => {
    const all = await rows();
    const month = all.find((f) => f.start === '1907-05-01')!;
    expect(month.end).toBe('1907-05-31');
    expect(month.entity.startDate).toBe('1907-05');
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
