/**
 * Amsterdam Diaries ingestion: an entry is a story linked to every Amsterdam place
 * it mentions, a street by its Adamlink id and a building by its point, dated at the
 * source's precision, with its transcription in a Manuscript entity and its opening
 * as the description. Fixture: one entry over two places, one month-dated entry, one
 * undated entry that is skipped.
 */
import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { sql } from 'drizzle-orm';
import { resolve } from 'path';
import type { ManuscriptEntity } from '@atm/shared';
import { setupTestDb, cleanTestDb, teardownTestDb, db } from './setup';
import { parseEntryDate } from '../etl/sources/amsterdam-diaries';

type Row = { id: string; url: string; label: string; record_type: string; description: string; start: string; end: string; entity: ManuscriptEntity };

describe('amsterdam-diaries ingestion', () => {
  beforeAll(async () => {
    await setupTestDb();
    await cleanTestDb();
    await db.execute(sql`INSERT INTO organisations (id, label) VALUES ('adamlink', 'Adamlink')`);
    // the street by its Adamlink id, and an address at the building's point
    await db.execute(sql`INSERT INTO place (id, type, source, name) VALUES
      ('https://adamlink.nl/geo/street/prinsengracht/3684', 'street', 'adamlink', 'Prinsengracht'),
      ('ad-concertgebouw', 'address', 'adamlink', 'Concertgebouwplein 10')`);
    await db.execute(sql`INSERT INTO place_geometry (place_id, geometry) VALUES
      ('https://adamlink.nl/geo/street/prinsengracht/3684', ST_Transform(ST_GeomFromText('LINESTRING(4.88 52.36, 4.885 52.365)', 4326), 28992)),
      ('ad-concertgebouw', ST_Transform(ST_GeomFromText('POINT(4.9 52.37)', 4326), 28992))`);
    const { ingest } = await import('../etl/sources/amsterdam-diaries');
    await ingest(resolve(__dirname, 'fixtures/amsterdam-diaries.jsonl'));
  });

  afterAll(async () => {
    await cleanTestDb();
    await teardownTestDb();
  });

  async function rows(): Promise<Row[]> {
    const r = await db.execute<Row>(sql`
      SELECT id, url, label, record_type, description, start_date::text AS start, end_date::text AS end, entity
      FROM features ORDER BY start_date`);
    return r.rows;
  }

  test('every dated entry becomes one story; the undated one is skipped', async () => {
    const all = await rows();
    expect(all.length).toBe(2);
    expect(all.every((f) => f.record_type === 'story')).toBe(true);
    expect(all.map((f) => f.label)).toEqual(['Dagboek Els Polak, deel 2', 'Dagboek Els Polak, deel 2']);
  });

  test('an entry is linked to each place it mentions: the street by id, the building by point', async () => {
    const r = await db.execute<{ place_id: string; relation_id: string }>(sql`
      SELECT fp.place_id, fp.relation_id FROM feature_to_place fp JOIN features f ON f.id = fp.feature_id
      WHERE f.start_date = '1941-03-19' ORDER BY fp.place_id`);
    expect(r.rows.map((x) => x.place_id)).toEqual(['ad-concertgebouw', 'https://adamlink.nl/geo/street/prinsengracht/3684']);
    expect(r.rows.every((x) => x.relation_id === 'mentions')).toBe(true);
  });

  test('dates keep the source precision; the description is the opening of the text', async () => {
    const all = await rows();
    const month = all.find((f) => f.start === '1943-01-01')!;
    expect(month.end).toBe('1943-01-31');
    expect(month.entity.dateCreated).toBe('1943-01');
    const day = all.find((f) => f.start === '1941-03-19')!;
    expect(day.description).toBe("19 Maart '41.\nVader is weer thuis!!!!");
    expect(day.url).toBe('https://id.amsterdamtimemachine.nl/ark:/81741/amsterdam-diaries/annotations/entries/1');
  });

  test('the entity is a Manuscript with its text, author, diary and mentions', async () => {
    const all = await rows();
    const e = all.find((f) => f.start === '1941-03-19')!.entity;
    expect(e.type).toBe('Manuscript');
    expect(e.name).toBe("19 Maart '41.");
    expect(e.text).toBe("19 Maart '41.\nVader is weer thuis!!!!");
    expect(e.author).toEqual({ type: 'Person', name: 'Els Polak', url: 'http://www.wikidata.org/entity/Q125020291' });
    expect(e.isPartOf).toEqual({ type: 'Book', name: 'Dagboek Els Polak, deel 2', url: 'https://resolver.kb.nl/resolve?urn=urn:gvn:EVDO01:IIAV002_IAV001000041', temporalCoverage: '1941' });
    expect(e.mentions.map((m) => `${m.type}:${m.name}`)).toEqual(['Place:Prinsengracht', 'Place:Koninklijk Concertgebouw', 'Person:Zeno Paul Polak']);
  });

  test('date parsing keeps the source precision and rejects what it cannot read', () => {
    expect(parseEntryDate('1941-03-19')).toEqual({ startDate: '1941-03-19', endDate: '1941-03-19' });
    expect(parseEntryDate('1943-01')).toEqual({ startDate: '1943-01-01', endDate: '1943-01-31' });
    expect(parseEntryDate('1940')).toEqual({ startDate: '1940-01-01', endDate: '1940-12-31' });
    expect(parseEntryDate('1941-02-30')).toBeNull();
    expect(parseEntryDate(null)).toBeNull();
  });
});
