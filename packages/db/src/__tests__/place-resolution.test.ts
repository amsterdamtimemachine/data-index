/**
 * Feature → place resolution behaviour (the new point/name resolvers). Seeds small
 * controlled fixtures per test — places in RD/28992 so distances are exact — and asserts
 * era discrimination, the distance caps, finest-granularity linking, the dated-area
 * tiebreak, exact/ambiguous name matching, undated name rows being labels rather than
 * candidates, and the tagged skip reasons.
 */
import { describe, test, expect, beforeAll, afterAll, beforeEach } from 'bun:test';
import { sql } from 'drizzle-orm';
import { setupTestDb, cleanTestDb, teardownTestDb, db } from './setup';
import { getCandidatesByPoint, getCandidatesByName, pickFinest, resolveNamePool, rank, twinOf, type Candidate } from '../etl/places/place-candidates';
import { inferByPoint, inferByName, inferByPointConfirmed } from '../etl/places/place-inference';
import { clearResolverCaches } from '../etl/places/cache';

const Q = 'POINT(120000 485000)'; // RD query point

async function seedOrgs() {
  await db.execute(sql`INSERT INTO agents (id, label) VALUES
    ('adamlink','Adamlink'), ('bag','BAG'), ('cbs','CBS'), ('nwb','NWB') ON CONFLICT (id) DO NOTHING`);
}
async function place(id: string, type: string, source: string, name: string | null, wktRD?: string, since: string | null = null, until: string | null = null) {
  await db.execute(sql`INSERT INTO place (id, type, source, name) VALUES (${id}, ${type}, ${source}, ${name})`);
  if (wktRD) await db.execute(sql`INSERT INTO place_geometry (place_id, geometry, since, until)
    VALUES (${id}, ST_GeomFromText(${wktRD}, 28992), ${since}, ${until})`);
}
async function building(placeId: string, buildingId: string) {
  await db.execute(sql`UPDATE place_geometry SET building_id = ${buildingId} WHERE place_id = ${placeId}`);
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

  // a name row without any period is a label (an undated Adamlink variant), not an
  // observation: it never competes, so only the dated overlap resolves, and a
  // place that has nothing but the label is not found at all
  test('an undated name row is a label, not a candidate', async () => {
    await place('pA', 'street', 'adamlink', null);
    await histName('hA', 'pA', 'Oudekerk', null, null);
    await place('pB', 'street', 'adamlink', null);
    await histName('hB', 'pB', 'Oudekerk', '1900-01-01', '1950-01-01');
    expect(await getCandidatesByName('Oudekerk', '1920-01-01', '1920-01-01').then((c) => c.map((x) => x.placeId))).toEqual(['pB']);
    expect(await inferByName(nkey('Oudekerk', '1920-01-01', '1920-01-01'))).toEqual({ placeId: 'pB' });
    await db.execute(sql`DELETE FROM place_historical_name WHERE id = 'hB'`);
    expect(await getCandidatesByName('Oudekerk', '1920-01-01', '1920-01-01')).toEqual([]);
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

  // the same address as both sources record it: one BAG building, one house designation
  async function seedTwins() {
    await place('lp-115', 'address', 'adamlink', 'Binnen Amstel 115', 'POINT(120000 485010)');
    await histName('n-115', 'lp-115', 'Binnen Amstel 115', '1943-01-01', '1943-12-31');
    await building('lp-115', 'B1');
    await place('bag-115', 'address', 'bag', 'Amstel 115', 'POINT(120000 485009)');
    await building('bag-115', 'B1');
  }

  test('twins: same building and house designation across sources, not a unit of the house', async () => {
    await seedTwins();
    await place('bag-115-h', 'address', 'bag', 'Amstel 115-H', 'POINT(120000 485008)');
    await building('bag-115-h', 'B1');
    await place('bag-117', 'address', 'bag', 'Amstel 117', 'POINT(120000 485007)');
    await building('bag-117', 'B1');
    const ids = async (id: string) => (await twinOf(id, '1898-04-01', '1898-04-01')).map((t) => t.placeId);
    expect(await ids('bag-115')).toEqual(['lp-115']);
    expect(await ids('lp-115')).toEqual(['bag-115']);
    expect(await ids('bag-115-h')).toEqual([]);
    expect(await ids('bag-117')).toEqual([]);
  });

  test('twins: a shared name and the days to the nearest name record', async () => {
    await seedTwins();
    const [twin] = await twinOf('bag-115', '1898-04-01', '1898-04-01');
    // the days from 1898-04-01 to the 1943 register
    expect(twin).toEqual({ placeId: 'lp-115', sharesName: false, gapDays: 16345 });
    const [back] = await twinOf('lp-115', '1898-04-01', '1898-04-01');
    expect(back.sharesName).toBe(false);
    expect(back.gapDays).toBeGreaterThan(365 * 100);
  });

  test('twins: a house number after a numbered street name', async () => {
    await place('lp-12', 'address', 'adamlink', '1e Helmersstraat 12', 'POINT(120000 485010)');
    await building('lp-12', 'B2');
    await place('bag-12', 'address', 'bag', '1e Helmersstraat 12', 'POINT(120000 485009)');
    await building('bag-12', 'B2');
    await place('bag-1', 'address', 'bag', '1e Helmersstraat 1', 'POINT(120000 485008)');
    await building('bag-1', 'B2');
    expect((await twinOf('lp-12', '1990-01-01', '1990-01-01')).map((t) => t.placeId)).toEqual(['bag-12']);
  });

  test('several twins: the one that shares a name wins over another street in the building', async () => {
    await place('lp-munt', 'address', 'adamlink', 'Muntplein 2', 'POINT(120000 485010)');
    await histName('n-munt', 'lp-munt', 'Munt 2', '1943-01-01', '1943-12-31');
    await building('lp-munt', 'B4');
    await place('bag-munt', 'address', 'bag', 'Muntplein 2', 'POINT(120000 485009)');
    await building('bag-munt', 'B4');
    await place('bag-joris', 'address', 'bag', 'Sint Jorissteeg 2', 'POINT(120000 485008)');
    await building('bag-joris', 'B4');
    // only Adamlink knows the old name; the 1990 feature moves to the BAG twin on the same street
    expect(await inferByName(nkey('Munt 2', '1990-01-01', '1990-01-01'))).toEqual({ placeId: 'bag-munt' });
  });

  test('several twins: the register nearest the feature date wins', async () => {
    await place('bag-115', 'address', 'bag', 'Amstel 115', 'POINT(120000 485009)');
    await building('bag-115', 'B1');
    await place('lp-1909', 'address', 'adamlink', 'Binnen Amstel 115', 'POINT(120000 485010)');
    await histName('n-1909', 'lp-1909', 'Binnen Amstel 115', '1909-01-01', '1909-12-31');
    await building('lp-1909', 'B1');
    await place('lp-1943', 'address', 'adamlink', 'Binnen Amstel 115', 'POINT(120000 485011)');
    await histName('n-1943', 'lp-1943', 'Binnen Amstel 115', '1943-01-01', '1943-12-31');
    await building('lp-1943', 'B1');
    expect(await inferByName(nkey('Amstel 115', '1898-04-01', '1898-04-01'))).toEqual({ placeId: 'lp-1909' });
    expect(await inferByName(nkey('Amstel 115', '1930-01-01', '1930-01-01'))).toEqual({ placeId: 'lp-1943' });
  });

  test('name match outside its era yields to its twin: a renamed street finds the old address', async () => {
    await seedTwins();
    expect(await inferByName(nkey('Amstel 115', '1898-04-01', '1898-04-01'))).toEqual({ placeId: 'lp-115' });
    expect(await inferByName(nkey('Amstel 115', '1990-01-01', '1990-01-01'))).toEqual({ placeId: 'bag-115' });
    expect(await inferByName(nkey('Binnen Amstel 115', '1990-01-01', '1990-01-01'))).toEqual({ placeId: 'bag-115' });
  });

  test('name match outside its era stands without a twin, or with several', async () => {
    await place('lp-9', 'address', 'adamlink', 'Oude 9', 'POINT(120000 485010)');
    await histName('n-9', 'lp-9', 'Oude 9', '1943-01-01', '1943-12-31');
    expect(await inferByName(nkey('Oude 9', '1990-01-01', '1990-01-01'))).toEqual({ placeId: 'lp-9' });

    await building('lp-9', 'B3');
    await place('bag-9a', 'address', 'bag', 'Nieuwe 9', 'POINT(120000 485009)');
    await building('bag-9a', 'B3');
    await place('bag-9b', 'address', 'bag', 'Nieuwe 9', 'POINT(120000 485008)');
    await building('bag-9b', 'B3');
    clearResolverCaches();
    expect(await inferByName(nkey('Oude 9', '1990-01-01', '1990-01-01'))).toEqual({ placeId: 'lp-9' });
  });

  test('text confirmation outside its era yields to the twin too', async () => {
    await seedTwins();
    const wgs = await db.execute<{ wkt: string }>(sql`SELECT ST_AsText(ST_Transform(ST_GeomFromText(${Q}, 28992), 4326)) AS wkt`);
    const q = wgs.rows[0].wkt;
    expect(await inferByPointConfirmed(q, 'Carré, Amstel 115, Amsterdam.', '1898-04-01', '1898-04-01')).toEqual({ placeId: 'lp-115' });
  });

  test('text confirmation: the named neighbour wins over the nearer point, nearest otherwise', async () => {
    await place('lp-old', 'address', 'adamlink', 'E 52', 'POINT(120000 485001)');
    await histName('n-old', 'lp-old', 'E 52', '1853-01-01', '1853-12-31');
    await place('lp-new', 'address', 'adamlink', 'Kalverstraat 97', 'POINT(120000 484997)');
    await histName('n-new', 'lp-new', 'Kalverstraat 97', '1876-01-01', '1876-12-31');

    // the resolvers take WGS84, the fixtures are RD
    const wgs = await db.execute<{ wkt: string }>(sql`SELECT ST_AsText(ST_Transform(ST_GeomFromText(${Q}, 28992), 4326)) AS wkt`);
    const q = wgs.rows[0].wkt;

    const plain = await inferByPoint(JSON.stringify({ wkt: q, start: '1903-03-09', end: '1903-03-09' }));
    expect(plain).toEqual({ placeId: 'lp-old' });

    const named = await inferByPointConfirmed(q, 'Perry & Co., Kalverstraat 97, Amsterdam.', '1903-03-09', '1903-03-09');
    expect(named).toEqual({ placeId: 'lp-new' });

    const unnamed = await inferByPointConfirmed(q, 'Hotel Ponsen, Dordrecht.', '1903-03-09', '1903-03-09');
    expect(unnamed).toEqual({ placeId: 'lp-old' });
  });
});
