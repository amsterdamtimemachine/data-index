/**
 * Undated Adamlink name variants (altLabels) are kept as name rows without a period:
 * findable by the place search and shown with the current name, but never resolution
 * candidates and never the name canonicalisation's pick. Fixture: street-aliases.ttl.
 */
import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { sql } from 'drizzle-orm';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { setupTestDb, cleanTestDb, teardownTestDb, db } from './setup';
import { parseAdamlinkStreets } from '../etl/sources/adamlink-streets';
import { rebuildIndex } from '../etl/post-process/rebuild-index';
import { getCandidatesByName } from '../etl/places/place-candidates';
import { searchPlaces } from '../queries/place-search';

const FIXTURE = resolve(__dirname, 'fixtures/street-aliases.ttl');
const SQUARE = 'https://adamlink.nl/geo/street/SA1';
const MEDIEVAL = 'https://adamlink.nl/geo/street/SA2';
const KERKWEG = 'https://adamlink.nl/geo/street/SA3';

describe('street name aliases', () => {
  beforeAll(async () => {
    await setupTestDb();
    await cleanTestDb();
    const { ingest } = await import('../etl/sources/streets');
    await ingest(FIXTURE);
    await rebuildIndex();
  });

  afterAll(async () => {
    await cleanTestDb();
    await teardownTestDb();
  });

  test('the parser keeps undated variants as aliases, deduplicated and without the preferred label', () => {
    const square = parseAdamlinkStreets(readFileSync(FIXTURE, 'utf8')).find(s => s.uri === SQUARE)!;
    expect(square.names).toEqual([
      { label: 'Jonas Daniël Meijerplein', since: '1873', until: null, alias: false },
      { label: 'Deventer Houtmarkt', since: null, until: null, alias: true },
      { label: 'Houtmarkt', since: null, until: null, alias: true },
    ]);
  });

  test('aliases land as undated name rows with the same provenance as dated ones', async () => {
    const r = await db.execute<{ name: string; source: string; since: string | null; until: string | null }>(sql`
      SELECT name, source, since::text, until::text FROM place_historical_name WHERE place_id = ${SQUARE} ORDER BY name`);
    expect(r.rows).toEqual([
      { name: 'Deventer Houtmarkt', source: 'adamlink-straten', since: null, until: null },
      { name: 'Houtmarkt', source: 'adamlink-straten', since: null, until: null },
      { name: 'Jonas Daniël Meijerplein', source: 'adamlink-straten', since: '1873-01-01', until: null },
    ]);
  });

  test('an old name finds both the medieval street and the square it now belongs to', async () => {
    const matches = await searchPlaces('Deventer Houtmarkt');
    const ids = matches.map(m => m.placeId);
    expect(ids).toContain(MEDIEVAL);
    expect(ids).toContain(SQUARE);
    const viaAlias = matches.find(m => m.placeId === SQUARE)!;
    expect(viaAlias.matchedName).toBe('Deventer Houtmarkt');
    expect(viaAlias.name).toBe('Jonas Daniël Meijerplein');
    expect(viaAlias.matchedNameId).not.toBeNull();
    expect(viaAlias.matchedWindow).toBeNull();
  });

  test('an alias alone finds the place', async () => {
    const matches = await searchPlaces('Houtmarkt');
    expect(matches.map(m => m.placeId)).toEqual([SQUARE]);
  });

  test('canonicalisation never promotes an alias to the current name', async () => {
    const r = await db.execute<{ name: string }>(sql`SELECT name FROM place WHERE id = ${KERKWEG}`);
    expect(r.rows[0].name).toBe('Kerkweg');
  });

  test('aliases are not resolution candidates', async () => {
    const byAlias = await getCandidatesByName('Houtmarkt', '1900-01-01', '1900-12-31');
    expect(byAlias).toEqual([]);
    const byDated = await getCandidatesByName('Kerkstraat', '1850-01-01', '1850-12-31');
    expect(byDated.map(c => c.placeId)).toEqual([KERKWEG]);
  });
});
