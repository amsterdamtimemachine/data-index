/**
 * Feature → place resolution behaviour (the new point/name resolvers). Seeds small
 * controlled fixtures per test — places in RD/28992 so distances are exact — and asserts
 * era discrimination, the distance caps, finest-granularity linking, the dated-area
 * tiebreak, exact/ambiguous name matching, defensive both-open dating, and the tagged
 * skip reasons.
 */
import { describe, test, expect, beforeAll, afterAll, beforeEach } from 'bun:test';
import { sql } from 'drizzle-orm';
import { setupTestDb, cleanTestDb, teardownTestDb, db } from './setup';
import { getCandidatesByPoint, getCandidatesByName, pickFinest, resolveNamePool, rank, type Candidate } from '../etl/helpers/places/place-candidates';
import { inferByPoint, inferByName } from '../etl/helpers/places/place-inference';
import { clearResolverCaches } from '../etl/helpers/helpers';

const Q = 'POINT(120000 485000)'; // RD query point

async function seedOrgs() {
  await db.execute(sql`INSERT INTO organisations (id, label) VALUES
    ('adamlink','Adamlink'), ('bag','BAG'), ('cbs','CBS'), ('nwb','NWB') ON CONFLICT (id) DO NOTHING`);
}
async function place(id: string, type: string, source: string, name: string | null, wktRD?: string, since: string | null = null, until: string | null = null) {
  await db.execute(sql`INSERT INTO place (id, type, source, name) VALUES (${id}, ${type}, ${source}, ${name})`);
  if (wktRD) await db.execute(sql`INSERT INTO place_geometry (place_id, geometry, since, until)
    VALUES (${id}, ST_GeomFromText(${wktRD}, 28992), ${since}, ${until})`);
}
async function histName(id: string, placeId: string, name: string, since: string | null, until: string | null) {
  await db.execute(sql`INSERT INTO place_historical_name (id, place_id, name, since, until) VALUES (${id}, ${placeId}, ${name}, ${since}, ${until})`);
}
const point = (wkt: string, s: string | null, e: string | null) => getCandidatesByPoint(wkt, s as string, e as string, 28992);
const pkey = (s: string | null, e: string | null) => JSON.stringify({ wkt: Q, start: s, end: e });
const nkey = (area: string, s: string | null, e: string | null) => JSON.stringify({ area, start: s, end: e });

// containing polygon around the query point
const AREA = 'POLYGON((119900 484900, 120100 484900, 120100 485100, 119900 485100, 119900 484900))';

describe('feature → place resolution', () => {
  beforeAll(setupTestDb);
  afterAll(async () => { await cleanTestDb(); await teardownTestDb(); });
  beforeEach(async () => { await cleanTestDb(); await seedOrgs(); clearResolverCaches(); });

  test('point era discrimination: pre-1943 → adamlink address, post-1943 → bag address', async () => {
    await place('adam-a', 'address', 'adamlink', 'Oude 1', 'POINT(120000 485000)');
    await place('bag-a', 'address', 'bag', 'Nieuwe 1', 'POINT(120001 485000)'); // 1m away

    const hist = pickFinest(await point(Q, '1920-01-01', '1920-01-01'));
    expect(hist?.placeId).toBe('adam-a');

    const modern = pickFinest(await point(Q, '1990-01-01', '1990-01-01'));
    expect(modern?.placeId).toBe('bag-a');
  });

  test('point distance cap: address beyond 30m is not linked; within is', async () => {
    await place('far', 'address', 'bag', 'Far 1', 'POINT(120040 485000)'); // 40m > 30m cap
    expect(pickFinest(await point(Q, '1990-01-01', '1990-01-01'))).toBeUndefined();

    await place('near', 'address', 'bag', 'Near 1', 'POINT(120020 485000)'); // 20m < 30m
    expect(pickFinest(await point(Q, '1990-01-01', '1990-01-01'))?.placeId).toBe('near');
  });

  test('point links the finest granularity: address over containing district', async () => {
    await place('addr', 'address', 'bag', 'Addr 1', 'POINT(120000 485000)');
    await place('dist', 'district', 'cbs', 'District', AREA);
    expect(pickFinest(await point(Q, '1990-01-01', '1990-01-01'))?.placeId).toBe('addr');
  });

  test('point dated area outranks a both-open area on equal overlap (req 18)', async () => {
    await place('histD', 'district', 'adamlink', 'Hist D', AREA, '1900-01-01', '1950-01-01');
    await place('cbsD', 'district', 'cbs', 'CBS D', AREA); // both-open
    // no address/street → area is the finest resolvable
    expect(pickFinest(await point(Q, '1920-01-01', '1920-01-01'))?.placeId).toBe('histD');
  });

  test('name matches EXACTLY (case-insensitive), not as a wildcard', async () => {
    await place('k1', 'street', 'adamlink', 'Kerkstraat');
    expect((await getCandidatesByName('kerkstraat', '1920-01-01', '1920-01-01')).length).toBe(1);
    expect((await getCandidatesByName('Kerk%straat', '1920-01-01', '1920-01-01')).length).toBe(0);
  });

  test('name ambiguity (two equal-gap same-type places) → skip', async () => {
    await place('k1', 'street', 'adamlink', 'Kerkstraat'); // Amsterdam
    await place('k2', 'street', 'nwb', 'Kerkstraat');      // Weesp
    expect(resolveNamePool(await getCandidatesByName('Kerkstraat', '1920-01-01', '1920-01-01')).kind).toBe('ambiguous');
    expect(await inferByName(nkey('Kerkstraat', '1920-01-01', '1920-01-01'))).toEqual({ skip: 'ambiguous' });
  });

  test('name both-open historical scores below a dated overlap (defensive, req 11)', async () => {
    await place('pA', 'street', 'adamlink', null);
    await histName('hA', 'pA', 'Oudekerk', null, null);              // both-open
    await place('pB', 'street', 'adamlink', null);
    await histName('hB', 'pB', 'Oudekerk', '1900-01-01', '1950-01-01'); // dated, overlaps 1920
    expect(await inferByName(nkey('Oudekerk', '1920-01-01', '1920-01-01'))).toEqual({ placeId: 'pB' });
  });

  test('name transition day: feature on until = successor.since resolves to the successor, not ambiguous', async () => {
    await place('old', 'street', 'adamlink', null);
    await histName('h-old', 'old', 'Damstraat', '1900-01-01', '1943-01-01'); // until is EXCLUSIVE
    await place('new', 'street', 'adamlink', null);
    await histName('h-new', 'new', 'Damstraat', '1943-01-01', '2000-01-01'); // since = old.until
    // on the boundary day the old name has already ended (exclusive until) → unique successor
    expect(await inferByName(nkey('Damstraat', '1943-01-01', '1943-01-01'))).toEqual({ placeId: 'new' });
  });

  test('tagged skip reasons: undated (fetcher methods) and no-match', async () => {
    await place('k1', 'street', 'adamlink', 'Kerkstraat');
    expect(await inferByName(nkey('Kerkstraat', null, null))).toEqual({ skip: 'undated' });
    expect(await inferByPoint(pkey(null, null))).toEqual({ skip: 'undated' });
    expect(await inferByName(nkey('Nowhere', '1920-01-01', '1920-01-01'))).toEqual({ skip: 'no-match' });
  });

  // ── §1: the req-18 dated tiebreak lives in rank(), not in row order ──
  test('req-18 dated tiebreak is in rank(): dated wins from either input order', () => {
    const datedAdamlink: Candidate = { placeId: 'histD', name: 'H', type: 'district', source: 'adamlink', distanceM: 0, overlapDays: 100, eraFit: true, dated: true };
    const undatedCbs: Candidate = { placeId: 'cbsD', name: 'C', type: 'district', source: 'cbs', distanceM: 0, overlapDays: 100, eraFit: true, dated: false };
    expect([undatedCbs, datedAdamlink].sort(rank)[0].placeId).toBe('histD');
    expect([datedAdamlink, undatedCbs].sort(rank)[0].placeId).toBe('histD');
  });

  // ── §2: CURRENT_ANCHOR pivots current-name vs historical-name by feature date ──
  test('current vs historical name scoring pivots on the feature date', async () => {
    await place('cur', 'street', 'adamlink', 'Beurstraat');                    // current name
    await place('hst', 'street', 'adamlink', null);
    await histName('h-hst', 'hst', 'Beurstraat', '1905-01-01', '1915-01-01');  // historical window
    expect(await inferByName(nkey('Beurstraat', '1910-01-01', '1910-01-01'))).toEqual({ placeId: 'hst' });
    expect(await inferByName(nkey('Beurstraat', '2020-01-01', '2020-01-01'))).toEqual({ placeId: 'cur' });
  });

  // ── §3: real (multi-year) ranges exercise the overlap SQL ──
  test('area overlap ranking: the vintage with the larger overlap wins', async () => {
    await place('d1900', 'district', 'adamlink', 'D1900', AREA, '1900-01-01', '1925-01-01');
    await place('d1925', 'district', 'adamlink', 'D1925', AREA, '1925-01-01', '1960-01-01');
    // feature [1920,1950]: ~5y overlap with d1900, ~25y with d1925 → d1925
    expect(pickFinest(await point(Q, '1920-01-01', '1950-01-01'))?.placeId).toBe('d1925');
  });

  test('era straddle: a range crossing ERA_CUTOFF makes both address layers era-fit → nearest wins', async () => {
    await place('adam-a', 'address', 'adamlink', 'Oude 1', 'POINT(120005 485000)'); // 5m
    await place('bag-a', 'address', 'bag', 'Nieuwe 1', 'POINT(120001 485000)');      // 1m
    expect(pickFinest(await point(Q, '1940-01-01', '1950-01-01'))?.placeId).toBe('bag-a');
  });

  // ── §4: street granularity (caps, era preference, priority) ──
  test('point street cap: a street beyond 50m is not linked; within is', async () => {
    await place('far-s', 'street', 'adamlink', 'Far St', 'LINESTRING(119950 485060, 120050 485060)');  // 60m
    expect(pickFinest(await point(Q, '1920-01-01', '1920-01-01'))).toBeUndefined();
    await place('near-s', 'street', 'adamlink', 'Near St', 'LINESTRING(119950 485040, 120050 485040)'); // 40m
    expect(pickFinest(await point(Q, '1920-01-01', '1920-01-01'))?.placeId).toBe('near-s');
  });

  test('point street era preference: adamlink wins over a nearer nwb street', async () => {
    await place('adam-s', 'street', 'adamlink', 'Adam St', 'LINESTRING(119950 485040, 120050 485040)'); // 40m
    await place('nwb-s', 'street', 'nwb', 'NWB St', 'LINESTRING(119950 485020, 120050 485020)');        // 20m, nearer
    expect(pickFinest(await point(Q, '1920-01-01', '1920-01-01'))?.placeId).toBe('adam-s');
  });

  test('point granularity: address wins over street', async () => {
    await place('a', 'address', 'bag', 'A', 'POINT(120000 485000)');
    await place('s', 'street', 'adamlink', 'S', 'LINESTRING(119950 485040, 120050 485040)');
    expect(pickFinest(await point(Q, '1990-01-01', '1990-01-01'))?.placeId).toBe('a');
  });

  test('point granularity: street wins over district', async () => {
    await place('s', 'street', 'adamlink', 'S', 'LINESTRING(119950 485040, 120050 485040)');
    await place('d', 'district', 'cbs', 'D', AREA);
    expect(pickFinest(await point(Q, '1990-01-01', '1990-01-01'))?.placeId).toBe('s');
  });

  // ── §5: dirty name strings ──
  test('name matching folds diacritic case (collation-dependent)', async () => {
    await place('cur', 'street', 'adamlink', 'Curaçaostraat');
    expect((await getCandidatesByName('CURAÇAOSTRAAT', '1990-01-01', '1990-01-01')).length).toBe(1);
  });

  test('name matching handles an apostrophe in the name', async () => {
    await place('kol', 'street', 'adamlink', "'t Kolkje");
    expect((await getCandidatesByName("'t kolkje", '1990-01-01', '1990-01-01')).length).toBe(1);
  });

  test('name match is exact: _ is a literal, not a wildcard', async () => {
    await place('k', 'street', 'adamlink', 'Kerkstraat');
    expect((await getCandidatesByName('Kerkstra_t', '1990-01-01', '1990-01-01')).length).toBe(0);
  });

  test('name match does not trim: untrimmed whitespace fails to match (the cascade trims, the query does not)', async () => {
    await place('k', 'street', 'adamlink', 'Kerkstraat');
    expect((await getCandidatesByName(' Kerkstraat ', '1990-01-01', '1990-01-01')).length).toBe(0);
  });

  test('name match does not repair an OCR-style internal split (fuzzy deferred)', async () => {
    await place('k', 'street', 'adamlink', 'Kerkstraat');
    expect((await getCandidatesByName('Kerk straat', '1990-01-01', '1990-01-01')).length).toBe(0);
  });

  test('name match does not Unicode-normalise: an NFD query misses an NFC name (fuzzy deferred)', async () => {
    await place('cur', 'street', 'adamlink', 'Curaçaostraat');                                          // NFC (precomposed ç)
    expect((await getCandidatesByName('Curac\u0327aostraat', '1990-01-01', '1990-01-01')).length).toBe(0);   // NFD (c + combining cedilla)
  });

  test('name query is parameterized: injection-shaped input matches nothing and leaves the table intact', async () => {
    await place('k', 'street', 'adamlink', 'Kerkstraat');
    expect((await getCandidatesByName("'; DROP TABLE place; --", '1990-01-01', '1990-01-01')).length).toBe(0);
    const r = await db.execute<{ count: string }>(sql`SELECT COUNT(*) AS count FROM place`);
    expect(parseInt(r.rows[0].count)).toBe(1);
  });

  // ── §6: point-path garbage ──
  test('point path rejects malformed WKT', async () => {
    await expect(inferByPoint(JSON.stringify({ wkt: 'POINT(4.9)', start: '1920-01-01', end: '1920-01-01' }))).rejects.toThrow();
  });

  test('point path: a coordinate that lands nowhere → cap-miss', async () => {
    await place('somewhere', 'address', 'bag', 'X', 'POINT(120000 485000)');
    // swapped lon/lat: POINT(52.37 4.9) in 4326 lands far outside the seeded area
    expect(await inferByPoint(JSON.stringify({ wkt: 'POINT(52.37 4.9)', start: '1920-01-01', end: '1920-01-01' })))
      .toEqual({ skip: 'cap-miss' });
  });
});
