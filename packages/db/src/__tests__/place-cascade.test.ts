/**
 * Cascade layer (PlaceIndex.extract): the ordered walk over extraction methods —
 * first placeId wins; across misses the most-actionable skip is kept (ambiguous >
 * cap-miss > undated > no-match). Also pins THE product decision on undated features:
 * the URI method is exempt from the undated guard (exact id, no date needed) while the
 * fetcher methods (WKT/TEXT) skip. Coordinates here are WGS84/4326 — the cascade's WKT
 * path passes srid=4326 by default (unlike the RD probes in place-resolution.test.ts).
 */
import { describe, test, expect, beforeAll, afterAll, beforeEach } from 'bun:test';
import { sql } from 'drizzle-orm';
import { setupTestDb, cleanTestDb, teardownTestDb, db } from './setup';
import { PlaceIndex, PlaceExtractionMethod } from '../etl/places/place-index';
import { clearResolverCaches } from '../etl/places/cache';

const W = 'POINT(4.9 52.37)'; // WGS84 query point (transformed to RD for the seeded geometry)
const dated = { start: '1920-01-01', end: '1920-01-01' };
const undated = { start: '', end: '' };

async function seedOrgs() {
  await db.execute(sql`INSERT INTO organisations (id, label) VALUES
    ('adamlink','Adamlink'), ('bag','BAG'), ('cbs','CBS'), ('nwb','NWB') ON CONFLICT (id) DO NOTHING`);
}
async function place(id: string, type: string, source: string, name: string | null) {
  await db.execute(sql`INSERT INTO place (id, type, source, name) VALUES (${id}, ${type}, ${source}, ${name})`);
}
async function geomWGS(id: string, lon: number, lat: number) {
  await db.execute(sql`INSERT INTO place_geometry (place_id, geometry)
    VALUES (${id}, ST_Transform(ST_GeomFromText(${`POINT(${lon} ${lat})`}, 4326), 28992))`);
}

// A record whose columns the extraction methods read by name.
type Rec = { text?: string; wkt?: string; uri?: string };
const TEXT = { method: PlaceExtractionMethod.TEXT, column: 'text' } as const;
const WKT = { method: PlaceExtractionMethod.WKT, column: 'wkt' } as const;
const URI = { method: PlaceExtractionMethod.URI, column: 'uri' } as const;

describe('place cascade (PlaceIndex.extract)', () => {
  beforeAll(setupTestDb);
  afterAll(async () => { await cleanTestDb(); await teardownTestDb(); });
  beforeEach(async () => { await cleanTestDb(); await seedOrgs(); clearResolverCaches(); });

  test('fallback: an ambiguous TEXT match falls through to a resolving WKT', async () => {
    await place('k1', 'street', 'adamlink', 'Kerkstraat'); // two same-name streets → TEXT ambiguous
    await place('k2', 'street', 'nwb', 'Kerkstraat');
    await place('wkt-hit', 'address', 'adamlink', 'Ergens 1');
    await geomWGS('wkt-hit', 4.9, 52.37); // exactly under the WKT point

    const idx = await PlaceIndex.create<Rec>([TEXT, WKT]);
    expect(await idx.extract({ text: 'Kerkstraat', wkt: W }, dated)).toEqual({ placeId: 'wkt-hit' });
  });

  test('skip precedence: TEXT ambiguous + WKT cap-miss keeps the more-actionable ambiguous', async () => {
    await place('k1', 'street', 'adamlink', 'Kerkstraat');
    await place('k2', 'street', 'nwb', 'Kerkstraat');
    await place('far', 'address', 'adamlink', 'Ver 1');
    await geomWGS('far', 5.25, 52.45); // nowhere near the WKT point → cap-miss

    const idx = await PlaceIndex.create<Rec>([TEXT, WKT]);
    expect(await idx.extract({ text: 'Kerkstraat', wkt: W }, dated)).toEqual({ skip: 'ambiguous' });
  });

  test('THE product decision: undated feature still resolves via the URI method (fetcher guard is bypassed)', async () => {
    await place('k1', 'street', 'adamlink', 'Kerkstraat'); // unique → dated would resolve; undated → skip
    await place('uri-place', 'address', 'adamlink', 'Adres 1');

    const idx = await PlaceIndex.create<Rec>([TEXT, URI]);
    // TEXT fetcher is guarded (undated → skip), URI is exempt and links by exact id
    expect(await idx.extract({ text: 'Kerkstraat', uri: 'uri-place' }, undated)).toEqual({ placeId: 'uri-place' });
  });

  test('THE product decision: undated feature with only fetcher methods is skipped as undated', async () => {
    await place('k1', 'street', 'adamlink', 'Kerkstraat');
    await place('pt', 'address', 'adamlink', 'Adres 1');
    await geomWGS('pt', 4.9, 52.37); // dated would resolve here; undated must not

    const idx = await PlaceIndex.create<Rec>([TEXT, WKT]);
    expect(await idx.extract({ text: 'Kerkstraat', wkt: W }, undated)).toEqual({ skip: 'undated' });
  });
});
