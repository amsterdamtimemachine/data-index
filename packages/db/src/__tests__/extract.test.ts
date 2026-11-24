/**
 * The extractors: a source's dump to the file its ingest reads. Cinema Context from a
 * pg_dump (a table it skips, columns in another order, COPY escapes, a bill out of
 * order, a film listed under another title, an empty item, a venue outside the
 * territory and one without a coordinate); the Diaries from their JSON-LD (an entry
 * at a street and a Wikidata place, with a drawing after its text, a place outside
 * the territory, an area, and an entry whose only place is an area). Each file then
 * goes through its ingest.
 */
import { describe, test, expect, beforeAll, afterAll, spyOn } from 'bun:test';
import { sql } from 'drizzle-orm';
import { mkdtempSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';
import { setupTestDb, cleanTestDb, teardownTestDb, db } from './setup';
import type { CinemaContextRecord } from '../etl/sources/cinema-context';
import type { DiaryEntryRow } from '../etl/sources/amsterdam-diaries';
import { run as extractCinemaContext } from '../etl/extractors/cinema-context';
import { run as extractDiaries } from '../etl/extractors/amsterdam-diaries';
import { loadScope } from '../etl/util/scope';

const MUNICIPALITY = resolve(__dirname, 'fixtures/municipality.geojson');
const KALVERSTRAAT = 'https://adamlink.nl/geo/street/kalverstraat/2158';
const LINE_1 = 'Vandaag liep ik over de Kalverstraat.';
const LINE_2 = 'Daarna naar het Olympisch Stadion en Schiphol.';

function readJsonl<T>(path: string): T[] {
  return readFileSync(path, 'utf8').trim().split('\n').map((line) => JSON.parse(line) as T);
}

let dir: string;
let programmes: CinemaContextRecord[];
let entries: DiaryEntryRow[];

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'atm-extract-'));
  await extractCinemaContext(resolve(__dirname, 'fixtures/cinema-context.sql'), join(dir, 'cc.jsonl'), { municipality: MUNICIPALITY });
  programmes = readJsonl(join(dir, 'cc.jsonl'));

  // the Diaries site files a diary under its writer
  const fetchSpy = spyOn(globalThis, 'fetch').mockImplementation((async (input: string | URL | Request) => {
    const url = String(input);
    if (url.endsWith('/api/dagboekschrijfsters/anna-de-vries')) return Response.json({ id: 7 });
    if (url.endsWith('/api/diaries/7')) return Response.json([{ id: 1 }]);
    return new Response('not found', { status: 404 });
  }) as typeof fetch);
  await extractDiaries(resolve(__dirname, 'fixtures/amsterdam-diaries-dump'), join(dir, 'diaries.jsonl'), { municipality: MUNICIPALITY });
  fetchSpy.mockRestore();
  entries = readJsonl(join(dir, 'diaries.jsonl'));
});

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('scope', () => {
  test('a point inside the municipality boundary is in, one outside is not', () => {
    const inScope = loadScope(MUNICIPALITY);
    expect(inScope(4.892, 52.3705)).toBe(true);
    expect(inScope(4.764169, 52.3081)).toBe(false);
    expect(inScope(4.48, 51.92)).toBe(false);
  });
});

describe('cinema-context extract', () => {
  test('only programmes with a venue point inside the territory, in the dump order', () => {
    expect(programmes.map((p) => p.programme_id)).toEqual(['P1', 'P4']);
  });

  test('a programme carries its ids, links, venue, address as written and point', () => {
    const { items, ...programme } = programmes[0];
    expect(items.length).toBe(3);
    expect(programme).toEqual({
      perm_id: 'V000001',
      url: 'https://cinemacontext.nl/id/V000001',
      programme_id: 'P1',
      date: '1934-01-05',
      venue: { perm_id: 'B000001', url: 'https://cinemacontext.nl/id/B000001', name: 'Rialto', type: 'Cinema' },
      address: 'Ceintuurbaan 338',
      geom_wkt: 'POINT(4.899 52.355)',
    });
  });

  test("the bill in its own order, an act as worded, a film under the bill's title with its own beside it", () => {
    expect(programmes[0].items).toEqual([
      { live: 'Mello Wendini,\nkomisch dressuur act' },
      {
        title: 'Skippy', film_perm_id: 'F000001', year: '1931', country: 'US', director: 'Norman Taurog',
        production_company: 'Paramount', url: 'https://cinemacontext.nl/id/F000001',
      },
      {
        title: 'Can Can (NL)', film_perm_id: 'F000002', year: '1960', country: 'US', production_company: 'Pathé\\Frères',
        url: 'https://cinemacontext.nl/id/F000002', original_title: 'Can-can',
      },
    ]);
  });

  test('a programme without a permanent id keeps its internal one and has no link', () => {
    expect(programmes[1]).toMatchObject({ perm_id: null, url: null, programme_id: 'P4', date: '1934-02' });
    expect(programmes[1].items.map((i) => i.title)).toEqual(['Can-can']);
  });
});

describe('amsterdam-diaries extract', () => {
  test('an entry is written once per place in the territory; areas and places outside are left out', () => {
    expect(entries.map((e) => [e.id, e.place.uri])).toEqual([
      ['entry-1', KALVERSTRAAT],
      ['entry-1', 'http://www.wikidata.org/entity/Q503319'],
    ]);
    expect(entries[0].places).toEqual([
      { uri: KALVERSTRAAT, name: 'Kalverstraat', kind: 'street', geom_wkt: 'POINT(4.892 52.3705)' },
      // named by the annotation where the external resources give no name
      { uri: 'http://www.wikidata.org/entity/Q503319', name: 'Olympisch Stadion', kind: 'wikidata', geom_wkt: 'POINT(4.8545 52.3435)' },
    ]);
  });

  test('the entry, its reading page, its diary and its writer with the page the site files the diary under', () => {
    expect(entries[0]).toMatchObject({
      url: 'https://diaries.amsterdamtimemachine.nl/dagboeken/anna-de-vries?page=1',
      name: '1 mei 1943',
      date: '1943-05-01',
      diary: { name: 'Dagboek van Anna', url: 'https://example.org/dagboek-anna' },
      author: { name: 'Anna de Vries', url: 'https://diaries.amsterdamtimemachine.nl/dagboekschrijfsters/anna-de-vries' },
    });
  });

  test('an excerpt per place: whole lines, its mentions, and the drawing that follows the text', () => {
    const text = `${LINE_1}\n${LINE_2}`;
    const at = (word: string) => text.indexOf(word);
    const image = { source: 'https://iiif.example.org/scan-1', region: '10,20,300,400', anchor: text.length + 1 };
    expect(entries[0].excerpts).toEqual([
      {
        place: KALVERSTRAAT, text, truncatedBefore: false, truncatedAfter: false,
        mentions: [{ start: at('Kalverstraat'), end: at('Kalverstraat') + 12 }], images: [image],
      },
      {
        place: 'http://www.wikidata.org/entity/Q503319', text, truncatedBefore: false, truncatedAfter: false,
        mentions: [{ start: at('Olympisch'), end: at('Olympisch') + 17 }], images: [image],
      },
    ]);
  });
});

describe('extracted files go through their ingest', () => {
  beforeAll(async () => {
    await setupTestDb();
    await cleanTestDb();
    await db.execute(sql`INSERT INTO agents (id, label) VALUES ('adamlink', 'Adamlink')`);
    await db.execute(sql`INSERT INTO place (id, type, source, name) VALUES
      ('cc-ceintuurbaan', 'address', 'adamlink', 'Ceintuurbaan 338'),
      (${KALVERSTRAAT}, 'street', 'adamlink', 'Kalverstraat')`);
    await db.execute(sql`INSERT INTO place_geometry (place_id, geometry) VALUES
      ('cc-ceintuurbaan', ST_Transform(ST_GeomFromText('POINT(4.899 52.355)', 4326), 28992)),
      (${KALVERSTRAAT}, ST_Transform(ST_GeomFromText('LINESTRING(4.891 52.37, 4.893 52.371)', 4326), 28992))`);
    const cinemaContext = await import('../etl/sources/cinema-context');
    await cinemaContext.ingest(join(dir, 'cc.jsonl'));
    const diaries = await import('../etl/sources/amsterdam-diaries');
    await diaries.ingest(join(dir, 'diaries.jsonl'));
  });

  afterAll(async () => {
    await cleanTestDb();
    await teardownTestDb();
  });

  test('both programmes are screenings at their venue, titled with their first film', async () => {
    const r = await db.execute<{ label: string; place_id: string }>(sql`
      SELECT f.label, fp.place_id FROM features f JOIN feature_to_place fp ON fp.feature_id = f.id
      WHERE f.dataset_id = 'cinema-context' ORDER BY f.start_date`);
    expect(r.rows).toEqual([
      { label: 'Skippy', place_id: 'cc-ceintuurbaan' },
      { label: 'Can-can', place_id: 'cc-ceintuurbaan' },
    ]);
  });

  test('the diary entry is linked to its street by the Adamlink id', async () => {
    const r = await db.execute<{ place_id: string }>(sql`
      SELECT fp.place_id FROM features f JOIN feature_to_place fp ON fp.feature_id = f.id
      WHERE f.dataset_id = 'amsterdam-diaries'`);
    expect(r.rows.map((row) => row.place_id)).toContain(KALVERSTRAAT);
  });
});
