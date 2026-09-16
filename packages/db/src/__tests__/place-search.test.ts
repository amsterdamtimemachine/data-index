/**
 * Place-name search over the gazetteer, asserted as ranking invariants:
 * exact name matches outrank everything, the rest follow a timeline (current rows
 * youngest first, then ended rows latest end first, then undated rows; data presence
 * plays no part), prefix matches, historical names match with their validity window,
 * a place matching on both names appears once, and unlinked places are findable with cells.
 */
import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { sql } from 'drizzle-orm';
import { setupTestDb, cleanTestDb, teardownTestDb, db } from './setup';
import { upsertSource } from '../etl/writers/feature-writer';
import { rebuildIndex } from '../etl/post-process/rebuild-index';
import { searchPlaces, getPlaceById } from '../queries/place-search';
import { getHeatmapTimeline } from '../queries/heatmap';
import { getHistogram } from '../queries/histogram';
import { getFeatures } from '../queries/features';

const STREET_DATA = 'ps-street-data';
const STREET_BARE = 'ps-street-bare';
const ADDR = 'ps-addr';
const RENAMED = 'ps-renamed';
const BOTH = 'ps-both';
const HOOD = 'ps-hood';
const RENUMBERED = 'ps-renumbered';
const DISTRICT_EXACT = 'ps-wijk-2';      // named exactly like a query that also prefixes many addresses
const ADDR_NUMBERED = 'ps-wijk-20-nr-1'; // one of those addresses, with a feature
const TOREN_YOUNG = 'ps-toren-young';    // Torenstraat rows that differ only in their place on the timeline
const TOREN_OPEN = 'ps-toren-open';
const TOREN_1900 = 'ps-toren-1900';
const TOREN_1700 = 'ps-toren-1700';
const TOREN_HIST = 'ps-toren-hist';      // still-open street that was called Torenstraat until 1850
const TOREN_ALIAS = 'ps-toren-alias';    // street begun 1950 with Torenstraat as an undated variant
const TOREN_UNDATED = 'ps-toren-undated';
const FID = '22222222-2222-2222-2222-2222222222aa';
const FID2 = '22222222-2222-2222-2222-2222222222bb';

describe('place search', () => {
  beforeAll(async () => {
    await setupTestDb();
    await cleanTestDb();
    await upsertSource({
      organisation: { id: 'ps-org', label: 'PS Org' },
      dataset: { id: 'ps-ds', label: 'PS DS' },
      relation: { id: 'isAbout', label: 'Is About' },
    });
    await db.execute(sql`INSERT INTO organisations (id, label) VALUES ('adamlink', 'Adamlink') ON CONFLICT (id) DO NOTHING`);

    // homonym streets: one carries a feature, the other is a bare gazetteer entry
    await db.execute(sql`INSERT INTO place (id, type, name) VALUES
      (${STREET_DATA}, 'street', 'Kerkstraat'),
      (${STREET_BARE}, 'street', 'Kerkstraat'),
      (${ADDR}, 'address', 'Kerkstraat 1'),
      (${RENAMED}, 'street', 'Modernstraat'),
      (${BOTH}, 'address', 'Kerkstraat 9'),
      (${HOOD}, 'neighbourhood', 'Kerkbuurt'),
      (${RENUMBERED}, 'street', 'Oudekerkspad'),
      (${DISTRICT_EXACT}, 'district', 'Wijk 2'),
      (${ADDR_NUMBERED}, 'address', 'Wijk 20, nr 1'),
      (${TOREN_YOUNG}, 'street', 'Torenstraat'),
      (${TOREN_OPEN}, 'street', 'Torenstraat'),
      (${TOREN_1900}, 'street', 'Torenstraat'),
      (${TOREN_1700}, 'street', 'Torenstraat'),
      (${TOREN_HIST}, 'street', 'Zuidstraat'),
      (${TOREN_ALIAS}, 'street', 'Torenplein'),
      (${TOREN_UNDATED}, 'street', 'Torenstraat')`);
    await db.execute(sql`UPDATE place SET source = 'adamlink' WHERE id = ${RENUMBERED}`);
    // non-adamlink open-ended name: canonicalisation must leave it alone
    await db.execute(sql`INSERT INTO place (id, type, name, source) VALUES ('ps-foreign', 'street', 'Vreemdstraat', 'ps-org')`);
    await db.execute(sql`INSERT INTO place_historical_name (id, place_id, name, since, until) VALUES
      ('ps-hist-5', 'ps-foreign', 'Nieuwstraat', '1960-01-01', NULL)`);
    await db.execute(sql`INSERT INTO place_geometry (place_id, geometry) VALUES
      (${STREET_DATA}, ST_GeomFromText('LINESTRING(120000 485000, 120300 485000)', 28992)),
      (${STREET_BARE}, ST_GeomFromText('LINESTRING(121000 486000, 121300 486000)', 28992)),
      (${ADDR}, ST_GeomFromText('POINT(120050 485050)', 28992)),
      (${RENAMED}, ST_GeomFromText('POINT(120150 485150)', 28992)),
      (${BOTH}, ST_GeomFromText('POINT(120250 485250)', 28992)),
      (${RENUMBERED}, ST_GeomFromText('POINT(120350 485350)', 28992)),
      (${ADDR_NUMBERED}, ST_GeomFromText('POINT(121250 485950)', 28992)),
      (${DISTRICT_EXACT}, ST_GeomFromText('POLYGON((120800 485800, 120990 485800, 120990 485950, 120800 485950, 120800 485800))', 28992)),
      (${TOREN_UNDATED}, ST_GeomFromText('LINESTRING(120800 485990, 120900 485990)', 28992))`);
    // a historical area division: geometry valid for a closed era
    await db.execute(sql`INSERT INTO place_geometry (place_id, geometry, since, until) VALUES
      (${HOOD}, ST_GeomFromText('POLYGON((120400 485400, 120700 485400, 120700 485700, 120400 485700, 120400 485400))', 28992), '1850-01-01', '1909-12-31'),
      (${TOREN_YOUNG}, ST_GeomFromText('LINESTRING(120000 485990, 120100 485990)', 28992), '1990-01-01', NULL),
      (${TOREN_OPEN}, ST_GeomFromText('LINESTRING(120000 485900, 120100 485900)', 28992), '1920-01-01', NULL),
      (${TOREN_1900}, ST_GeomFromText('LINESTRING(120200 485900, 120300 485900)', 28992), '1600-01-01', '1900-01-01'),
      (${TOREN_1700}, ST_GeomFromText('LINESTRING(120400 485900, 120500 485900)', 28992), '1400-01-01', '1700-01-01'),
      (${TOREN_HIST}, ST_GeomFromText('LINESTRING(120600 485900, 120700 485900)', 28992), '1500-01-01', NULL),
      (${TOREN_ALIAS}, ST_GeomFromText('LINESTRING(120200 485990, 120300 485990)', 28992), '1950-01-01', NULL)`);

    // Modernstraat 5 was named Kerkhofpad until the 1943 renumbering
    await db.execute(sql`INSERT INTO place_historical_name (id, place_id, name, since, until) VALUES
      ('ps-hist-1', ${RENAMED}, 'Kerkhofpad', '1850-01-01', '1943-01-01'),
      ('ps-hist-2', ${BOTH}, 'Kerkstraat 9', '1900-01-01', '1943-01-01'),
      ('ps-hist-3', ${RENUMBERED}, 'Kerkelaan', '1957-01-01', NULL),
      ('ps-hist-4', ${RENUMBERED}, 'Oudekerkspad', NULL, '1957-01-01'),
      ('ps-hist-6', ${TOREN_HIST}, 'Torenstraat', '1800-01-01', '1850-01-01'),
      ('ps-hist-7', ${TOREN_ALIAS}, 'Torenstraat', NULL, NULL)`);

    await db.execute(sql`
      INSERT INTO features (id, record_type, label, start_date, end_date, dataset_id)
      VALUES (${FID}, 'image', 'kerk feature', '1950-01-01', '1950-12-31', 'ps-ds'),
             (${FID2}, 'image', 'wijk feature', '1950-01-01', '1950-12-31', 'ps-ds')`);
    await db.execute(sql`INSERT INTO feature_to_place (feature_id, place_id, relation_id)
      VALUES (${FID}, ${STREET_DATA}, 'isAbout'), (${FID2}, ${ADDR_NUMBERED}, 'isAbout')`);

    await rebuildIndex();
  });

  afterAll(async () => {
    await cleanTestDb();
    await teardownTestDb();
  });

  test('an exact name match leads even when prefix matches outnumber it', async () => {
    // "Wijk 2" is a district; "Wijk 20, nr 1" is one of many addresses it prefixes
    const matches = await searchPlaces('Wijk 2');
    const ids = matches.map((m) => m.placeId);
    expect(ids[0]).toBe(DISTRICT_EXACT);
    expect(ids).toContain(ADDR_NUMBERED);
  });

  test('exact matches follow a timeline: current youngest first, ended latest end first, undated last', async () => {
    // the variant of the 1950 street sorts with its place; the historical match sorts
    // on its name's end (1850), not on its still-open geometry
    const matches = await searchPlaces('Torenstraat');
    const ids = matches.map((m) => m.placeId);
    expect(ids).toEqual([TOREN_YOUNG, TOREN_ALIAS, TOREN_OPEN, TOREN_1900, TOREN_HIST, TOREN_1700, TOREN_UNDATED]);
    expect(matches[1].matchedNameId).toBe('ps-hist-7');
    expect(matches[1].matchedWindow).toBeNull();
  });

  test('data presence plays no part; no digit hides addresses', async () => {
    // both Kerkstraat rows are exact, undated homonyms; only one carries a feature
    const matches = await searchPlaces('Kerkstraat');
    const ids = matches.map((m) => m.placeId);
    expect(ids.slice(0, 2).sort()).toEqual([STREET_BARE, STREET_DATA].sort());
    expect(matches.find((m) => m.placeId === STREET_DATA)!.featureCount).toBe(1);
    expect(ids).not.toContain(ADDR);
  });

  test('a digit in the query surfaces addresses', async () => {
    const matches = await searchPlaces('Kerkstraat 1');
    const ids = matches.map((m) => m.placeId);
    expect(ids).toContain(ADDR);
  });

  test('unlinked place is findable and carries its cells', async () => {
    const matches = await searchPlaces('Kerkstraat');
    const bare = matches.find((m) => m.placeId === STREET_BARE);
    expect(bare).toBeDefined();
    expect(bare!.featureCount).toBe(0);
    expect(bare!.cells.length).toBeGreaterThan(0);
  });

  test('historical name matches with its validity window and row id', async () => {
    const matches = await searchPlaces('Kerkhof');
    expect(matches.length).toBe(1);
    expect(matches[0].placeId).toBe(RENAMED);
    expect(matches[0].name).toBe('Modernstraat');
    expect(matches[0].matchedName).toBe('Kerkhofpad');
    expect(matches[0].matchedNameId).toBe('ps-hist-1');
    expect(matches[0].matchedWindow).toEqual(['1850-01-01', '1943-01-01']);
  });

  test('a nameId restores the clicked alias; a foreign nameId is ignored', async () => {
    const byName = await getPlaceById(RENAMED, { nameId: 'ps-hist-1' });
    expect(byName!.matchedName).toBe('Kerkhofpad');
    expect(byName!.matchedNameId).toBe('ps-hist-1');
    expect(byName!.matchedWindow).toEqual(['1850-01-01', '1943-01-01']);
    expect(byName!.name).toBe('Modernstraat');

    // ps-hist-1 belongs to RENAMED, not STREET_DATA: fall back to the current name
    const foreign = await getPlaceById(STREET_DATA, { nameId: 'ps-hist-1' });
    expect(foreign!.matchedName).toBe('Kerkstraat');
    expect(foreign!.matchedNameId).toBeNull();
    expect(foreign!.matchedWindow).toBeNull();
  });

  test('a place matching on current and historical name appears once, as current', async () => {
    const matches = await searchPlaces('Kerkstraat 9');
    const hits = matches.filter((m) => m.placeId === BOTH);
    expect(hits.length).toBe(1);
    expect(hits[0].matchedWindow).toBeNull();
  });

  test('short queries return nothing', async () => {
    expect(await searchPlaces('K')).toEqual([]);
    expect(await searchPlaces('  ')).toEqual([]);
  });

  test('LIKE wildcards in the query are literal', async () => {
    expect(await searchPlaces('Kerk%')).toEqual([]);
    expect(await searchPlaces('Kerk_traat')).toEqual([]);
  });

  // The fixture's only feature sits on STREET_DATA, so the heatmap's occupied
  // cells and the street's folded cells must be the same set — pinning that both
  // fold with the same partition.
  test('folded cells land exactly on heatmap cells', async () => {
    // the two feature-bearing places between them cover every heatmap cell
    const first = (await searchPlaces('Kerkstraat', { cols: 50 })).find((m) => m.placeId === STREET_DATA)!;
    expect(first).toBeDefined();
    const [numbered] = await searchPlaces('Wijk 20, nr 1', { cols: 50 });
    expect(numbered.placeId).toBe(ADDR_NUMBERED);
    const heat = await getHeatmapTimeline({ cols: 50 });
    const heatCells = new Set<number>();
    for (const h of Object.values(heat.timeline)) {
      for (const i of h.indices) {
        heatCells.add(i);
      }
    }
    expect(new Set([...first.cells, ...numbered.cells])).toEqual(heatCells);
  });

  test('a dated area division carries its geometry window', async () => {
    const matches = await searchPlaces('Kerkbuurt');
    expect(matches.length).toBe(1);
    expect(matches[0].placeId).toBe(HOOD);
    expect(matches[0].geometryWindow).toEqual(['1850-01-01', '1909-12-31']);
    const street = await getPlaceById(STREET_DATA);
    expect(street!.geometryWindow).toBeNull();
  });

  // The Dam / de Plaetse pattern: the place row arrived bearing its oldest name;
  // rebuild canonicalises it to the open-ended history row, and the old name
  // stays findable through its own dated row, id and all.
  test('stored names are canonicalised; the old name stays findable with its window', async () => {
    const byId = await getPlaceById(RENUMBERED);
    expect(byId!.name).toBe('Kerkelaan');
    expect(byId!.matchedName).toBe('Kerkelaan');

    const old = await searchPlaces('Oudekerkspad');
    expect(old.length).toBe(1);
    expect(old[0].placeId).toBe(RENUMBERED);
    expect(old[0].matchedName).toBe('Oudekerkspad');
    expect(old[0].matchedNameId).toBe('ps-hist-4');
    expect(old[0].matchedWindow).toEqual([null, '1957-01-01']);
    expect(old[0].name).toBe('Kerkelaan');
  });

  test('canonicalisation is adamlink-only: other sources keep their stored name', async () => {
    const foreign = await getPlaceById('ps-foreign');
    expect(foreign!.name).toBe('Vreemdstraat');
    expect(foreign!.matchedName).toBe('Vreemdstraat');
  });

  test('getPlaceById restores a match by id', async () => {
    const byId = await getPlaceById(STREET_BARE);
    expect(byId).not.toBeNull();
    expect(byId!.name).toBe('Kerkstraat');
    expect(byId!.featureCount).toBe(0);
    expect(byId!.cells.length).toBeGreaterThan(0);
    expect(byId!.matchedWindow).toBeNull();
    expect(await getPlaceById('nope')).toBeNull();
  });

  // Same cell semantics as the histogram: the address has no linked features,
  // but its cell holds the street's feature, so its population counts 1.
  test('getFeatures by place counts features in the place cells', async () => {
    const street = await getFeatures({ area: { kind: 'place', placeId: STREET_DATA } });
    expect(street.total).toBe(1);
    expect(street.data.length).toBe(1);
    const addr = await getFeatures({ area: { kind: 'place', placeId: ADDR } });
    expect(addr.total).toBe(1);
    const bare = await getFeatures({ area: { kind: 'place', placeId: STREET_BARE } });
    expect(bare.total).toBe(0);
    expect(bare.data).toEqual([]);
  });

  test('sample sort by place is stable per seed', async () => {
    const a = await getFeatures({ area: { kind: 'place', placeId: STREET_DATA }, sort: 'sample', seed: 'x' });
    const b = await getFeatures({ area: { kind: 'place', placeId: STREET_DATA }, sort: 'sample', seed: 'x' });
    expect(b.data.map((f) => f.id)).toEqual(a.data.map((f) => f.id));
  });

  // Cell semantics: the series counts features in the place's cells, not features
  // linked to the place. The address has no linked features, but its cell holds
  // the street's feature, so it counts 1.
  test('histogram placeId counts features in the place cells', async () => {
    const street = await getHistogram(undefined, undefined, undefined, 50, undefined, STREET_DATA);
    expect(street.totalFeatures).toBe(1);
    const addr = await getHistogram(undefined, undefined, undefined, 50, undefined, ADDR);
    expect(addr.totalFeatures).toBe(1);
    const bare = await getHistogram(undefined, undefined, undefined, 50, undefined, STREET_BARE);
    expect(bare.totalFeatures).toBe(0);
  });
});
