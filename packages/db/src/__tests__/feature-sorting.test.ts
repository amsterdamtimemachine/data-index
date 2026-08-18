/**
 * Sort-mode properties, asserted as order invariants (never literal sequences):
 * round-robin fairness across record types and datasets, score monotonicity within
 * piles, seed determinism/sensitivity, pagination integrity, chronology escaping
 * the rotation, and cross-period order stability.
 *
 * Fixture: 2 record types × 2 datasets × 4 features each, with engineered
 * spatial_frequency (point place = 1 cell, line place = ~6 cells) and dates
 * (images 1900s, texts 1950s; the later half of each pile spans two time slices).
 */
import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { sql } from 'drizzle-orm';
import type { RecordType, FeatureResult, FeaturesSortField, SortDirection } from '@atm/shared';
import { setupTestDb, cleanTestDb, teardownTestDb, db } from './setup';
import { rebuildIndex } from '../etl/post-process/rebuild-index';
import { getFeatures } from '../queries/features';
import { getGridConfig } from '../queries/grid-config';
import { computeTimeSlices } from '../queries/time-slices';

const TYPES: RecordType[] = ['image', 'text'];
const DATASETS = ['dsA', 'dsB'];

/**
 * Round-robin fairness: when a group's k-th item appears, every other group that
 * still has items remaining must already have at least k-1 of them placed.
 */
function assertRoundRobin(sequence: string[]): void {
  const totals = new Map<string, number>();
  for (const group of sequence) {
    totals.set(group, (totals.get(group) ?? 0) + 1);
  }
  const counts = new Map<string, number>();
  for (const group of totals.keys()) {
    counts.set(group, 0);
  }
  for (const group of sequence) {
    const next = counts.get(group)! + 1;
    for (const [other, total] of totals) {
      if (other === group) {
        continue;
      }
      const placed = counts.get(other)!;
      if (placed < total) {
        expect(next).toBeLessThanOrEqual(placed + 1);
      }
    }
    counts.set(group, next);
  }
}

function ids(features: FeatureResult[]): string[] {
  return features.map((f) => f.id);
}

async function fetchAll(sort: FeaturesSortField, opts: { seed?: string; sortDirection?: SortDirection; timeSlice?: string; pageSize?: number; page?: number } = {}) {
  const cfg = await getGridConfig();
  const result = await getFeatures({
    bounds: { minLon: cfg.minLon, maxLon: cfg.maxLon, minLat: cfg.minLat, maxLat: cfg.maxLat },
    recordTypes: TYPES,
    sort,
    sortDirection: opts.sortDirection,
    seed: opts.seed,
    timeSlice: opts.timeSlice,
    page: opts.page ?? 1,
    pageSize: opts.pageSize ?? 100
  });
  return result.data;
}

describe('feature sorting', () => {
  beforeAll(async () => {
    await setupTestDb();
    await cleanTestDb();

    await db.execute(sql`INSERT INTO organisations (id, label) VALUES ('adamlink', 'A')`);
    await db.execute(sql`INSERT INTO datasets (id, label) VALUES ('dsA', 'Dataset A'), ('dsB', 'Dataset B')`);
    await db.execute(sql`INSERT INTO relation (id, label) VALUES ('isAbout', 'About') ON CONFLICT (id) DO NOTHING`);

    await db.execute(sql`INSERT INTO place (id, type, source, name) VALUES
      ('p-fine', 'address', 'adamlink', 'Fine 1'), ('p-coarse', 'street', 'adamlink', 'Coarse')`);
    await db.execute(sql`INSERT INTO place_geometry (place_id, geometry) VALUES
      ('p-fine', ST_GeomFromText('POINT(120000 485000)', 28992)),
      ('p-coarse', ST_GeomFromText('LINESTRING(120000 485000, 120500 485000)', 28992))`);

    for (const type of TYPES) {
      let baseYear = 1900;
      if (type === 'text') {
        baseYear = 1950;
      }
      for (const dataset of DATASETS) {
        for (let i = 0; i < 4; i++) {
          const start = `${baseYear + i * 5}-01-01`;
          // the later half of each pile spans two display slices
          let endYear = baseYear + i * 5;
          if (i >= 2) {
            endYear += 60;
          }
          const end = `${endYear}-12-31`;
          let placeId = 'p-fine';
          if (i % 2 === 1) {
            placeId = 'p-coarse';
          }
          const inserted = await db.execute<{ id: string }>(sql`
            INSERT INTO features (id, record_type, label, start_date, end_date, dataset_id)
            VALUES (gen_random_uuid(), ${type}, ${`${type}-${dataset}-${i}`}, ${start}::date, ${end}::date, ${dataset})
            RETURNING id`);
          await db.execute(sql`INSERT INTO feature_to_place (feature_id, place_id, relation_id)
            VALUES (${inserted.rows[0].id}::uuid, ${placeId}, 'isAbout')`);
        }
      }
    }

    await rebuildIndex();
  });

  afterAll(async () => {
    await cleanTestDb();
    await teardownTestDb();
  });

  test('sample: record types and datasets both rotate fairly', async () => {
    const data = await fetchAll('sample', { seed: 'test-seed' });
    expect(data.length).toBe(16);
    assertRoundRobin(data.map((f) => f.recordType));
    for (const type of TYPES) {
      const lane = data.filter((f) => f.recordType === type);
      assertRoundRobin(lane.map((f) => f.datasetLabel ?? ''));
    }
  });

  test('sample: same seed → identical order', async () => {
    const first = await fetchAll('sample', { seed: 'stable' });
    const second = await fetchAll('sample', { seed: 'stable' });
    expect(ids(second)).toEqual(ids(first));
  });

  test('sample: different seed → same set, different order', async () => {
    const a = await fetchAll('sample', { seed: 'seed-a' });
    const b = await fetchAll('sample', { seed: 'seed-b' });
    expect([...ids(a)].sort()).toEqual([...ids(b)].sort());
    expect(ids(a)).not.toEqual(ids(b));
  });

  test('sample: pages of one seed tile the full ordering (no dupes, no gaps)', async () => {
    const whole = await fetchAll('sample', { seed: 'paged' });
    const pages: string[] = [];
    for (let page = 1; page <= 4; page++) {
      const chunk = await fetchAll('sample', { seed: 'paged', page, pageSize: 4 });
      pages.push(...ids(chunk));
    }
    expect(pages).toEqual(ids(whole));
  });

  test('spatialFrequency: rotates fairly and orders each pile most-specific first', async () => {
    const data = await fetchAll('spatialFrequency');
    assertRoundRobin(data.map((f) => f.recordType));
    for (const type of TYPES) {
      const lane = data.filter((f) => f.recordType === type);
      assertRoundRobin(lane.map((f) => f.datasetLabel ?? ''));
      for (const dataset of DATASETS.map((d) => `Dataset ${d.slice(-1)}`)) {
        const pile = lane.filter((f) => f.datasetLabel === dataset);
        for (let i = 1; i < pile.length; i++) {
          expect(pile[i].spatialFrequency).toBeGreaterThanOrEqual(pile[i - 1].spatialFrequency);
        }
      }
    }
  });

  test('temporalFrequency: rotates fairly and orders each pile tightest-dated first', async () => {
    const data = await fetchAll('temporalFrequency');
    assertRoundRobin(data.map((f) => f.recordType));
    for (const type of TYPES) {
      const lane = data.filter((f) => f.recordType === type);
      assertRoundRobin(lane.map((f) => f.datasetLabel ?? ''));
      for (const dataset of DATASETS.map((d) => `Dataset ${d.slice(-1)}`)) {
        const pile = lane.filter((f) => f.datasetLabel === dataset);
        for (let i = 1; i < pile.length; i++) {
          expect(pile[i].temporalFrequency).toBeGreaterThanOrEqual(pile[i - 1].temporalFrequency);
        }
      }
    }
  });

  test('date: flat chronology, NOT interleaved by record type', async () => {
    const data = await fetchAll('date', { sortDirection: 'asc' });
    for (let i = 1; i < data.length; i++) {
      expect(data[i].dateRange[0]).toBeGreaterThanOrEqual(data[i - 1].dateRange[0]);
    }
    // all images start before any text, so true chronology puts every image first —
    // pinning that the explicit date sort escapes the rotation
    const firstTextIndex = data.findIndex((f) => f.recordType === 'text');
    expect(firstTextIndex).toBe(8);
  });

  // The rotation re-deals per result set (fairness is membership-dependent), so
  // cross-pile positions may shift with the period; the stable invariant is that
  // shared features keep relative order WITHIN their (type, dataset) pile.
  test('sample: period change keeps relative order within each pile', async () => {
    const slices = await computeTimeSlices();
    expect(slices.length).toBeGreaterThanOrEqual(2);
    const early = await fetchAll('sample', { seed: 'periods', timeSlice: slices[0].key });
    const late = await fetchAll('sample', { seed: 'periods', timeSlice: slices[1].key });
    const lateIds = new Set(ids(late));
    const shared = new Set(ids(early).filter((id) => lateIds.has(id)));
    expect(shared.size).toBeGreaterThanOrEqual(2);
    for (const type of TYPES) {
      for (const dataset of DATASETS.map((d) => `Dataset ${d.slice(-1)}`)) {
        const pile = (data: FeatureResult[]) =>
          data
            .filter((f) => f.recordType === type && f.datasetLabel === dataset && shared.has(f.id))
            .map((f) => f.id);
        expect(pile(late)).toEqual(pile(early));
      }
    }
  });
});
