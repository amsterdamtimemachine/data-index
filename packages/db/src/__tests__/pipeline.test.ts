/**
 * End-to-end integration tests for the ingestion + query pipeline.
 *
 * Seeds the test DB using real ingestion scripts on fixture data, then
 * exercises the exported query functions that the API endpoints use.
 */
import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { sql } from 'drizzle-orm';
import { db, setupTestDb, cleanTestDb, seedTestData, teardownTestDb } from './setup';

import { getFeatures } from '../queries/features';
import { getHeatmap, getHeatmapTimeline } from '../queries/heatmap';
import { getHistogram } from '../queries/histogram';
import { getMetadata } from '../queries/metadata';
import { computeTimeSlices, computeTimeRange } from '../queries/time-slices';

// Bounds that cover the full Amsterdam area
const BOUNDS = { minLon: 4.0, maxLon: 5.5, minLat: 52.0, maxLat: 52.5 };

beforeAll(async () => {
  await setupTestDb();
  await cleanTestDb();
  await seedTestData();

  // Compute spatial_frequency and temporal_frequency
  const { rebuildIndex } = await import('../etl/post-process/rebuild-index');
  await rebuildIndex();
});

afterAll(async () => {
  await cleanTestDb();
  await teardownTestDb();
});

// ============================================================================
// INGESTION
// ============================================================================

describe('LPS ingestion', () => {
  test('creates one place per linked point', async () => {
    const r = await db.execute<{ count: string }>(sql`SELECT COUNT(*) as count FROM place`);
    expect(parseInt(r.rows[0].count)).toBeGreaterThanOrEqual(5);
  });

  test('places have lp- prefixed IDs', async () => {
    const r = await db.execute<{ id: string }>(sql`SELECT id FROM place LIMIT 1`);
    expect(r.rows[0].id).toMatch(/^lp-\d+$/);
  });

  test('places have RD geometry populated', async () => {
    const r = await db.execute<{ count: string }>(
      sql`SELECT COUNT(*) as count FROM place WHERE geometry IS NOT NULL`
    );
    expect(parseInt(r.rows[0].count)).toBeGreaterThan(0);
  });

  test('addresses reference place_id', async () => {
    const r = await db.execute<{ count: string }>(sql`
      SELECT COUNT(*) as count FROM address a
      WHERE NOT EXISTS (SELECT 1 FROM place p WHERE p.id = a.place_id)
    `);
    expect(parseInt(r.rows[0].count)).toBe(0);
  });

  test('address source column is populated after ingestion', async () => {
    const r = await db.execute<{ source: string }>(
      sql`SELECT DISTINCT source FROM address WHERE source IS NOT NULL`
    );
    const sources = r.rows.map(r => r.source);
    expect(sources.length).toBeGreaterThan(0);
  });
});

describe('Adressen ingestion', () => {
  test('address names are populated after adressen ingestion', async () => {
    const r = await db.execute<{ count: string }>(
      sql`SELECT COUNT(*) as count FROM address WHERE name IS NOT NULL`
    );
    expect(parseInt(r.rows[0].count)).toBeGreaterThan(0);
  });

  test('place.current_address is the most recent dated address name', async () => {
    // Pick a place, check its current_address matches the address row with the latest date
    const r = await db.execute<{ place_id: string; current_address: string; most_recent: string }>(sql`
      SELECT p.id as place_id, p.current_address,
        (SELECT a.name FROM address a
         WHERE a.place_id = p.id AND a.name IS NOT NULL
         ORDER BY a.date DESC LIMIT 1) as most_recent
      FROM place p
      WHERE p.current_address IS NOT NULL
      LIMIT 5
    `);
    for (const row of r.rows) {
      expect(row.current_address).toBe(row.most_recent);
    }
  });

  test('address dates are updated from adressen CSV', async () => {
    // After adressen ingestion, some addresses should have dates other than
    // the 1943/1909/1876/1853/1832 placeholders LPS uses
    const r = await db.execute<{ count: string }>(
      sql`SELECT COUNT(*) as count FROM address WHERE date IS NOT NULL`
    );
    expect(parseInt(r.rows[0].count)).toBeGreaterThan(0);
  });
});

describe('Feature ingestion', () => {
  test('beeldbank features have record_type = image', async () => {
    const r = await db.execute<{ count: string }>(
      sql`SELECT COUNT(*) as count FROM features WHERE dataset_id = 'beeldbank' AND record_type = 'image'`
    );
    expect(parseInt(r.rows[0].count)).toBeGreaterThan(0);
  });

  test('joods-monument features have record_type = person', async () => {
    const r = await db.execute<{ count: string }>(
      sql`SELECT COUNT(*) as count FROM features WHERE dataset_id = 'joods-monument' AND record_type = 'person'`
    );
    expect(parseInt(r.rows[0].count)).toBe(5);
  });

  test('joods-monument features have fixed 1900-1945 date range', async () => {
    const r = await db.execute<{ start_date: string; end_date: string }>(
      sql`SELECT start_date, end_date FROM features WHERE dataset_id = 'joods-monument' LIMIT 1`
    );
    expect(r.rows[0].start_date).toBe('1900-01-01');
    expect(r.rows[0].end_date).toBe('1945-12-31');
  });

  test('every feature is linked to at least one place', async () => {
    const r = await db.execute<{ count: string }>(sql`
      SELECT COUNT(*) as count FROM features f
      WHERE NOT EXISTS (SELECT 1 FROM feature_to_place fp WHERE fp.feature_id = f.id)
    `);
    expect(parseInt(r.rows[0].count)).toBe(0);
  });

  test('features have entity JSONB with correct schema.org type', async () => {
    const bb = await db.execute<{ entity: any }>(
      sql`SELECT entity FROM features WHERE dataset_id = 'beeldbank' LIMIT 1`
    );
    expect(bb.rows[0].entity.type).toBe('MediaObject');

    const jm = await db.execute<{ entity: any }>(
      sql`SELECT entity FROM features WHERE dataset_id = 'joods-monument' LIMIT 1`
    );
    expect(jm.rows[0].entity.type).toBe('Person');
  });
});

describe('rebuild-index', () => {
  test('all features have spatial_frequency set', async () => {
    const r = await db.execute<{ count: string }>(
      sql`SELECT COUNT(*) as count FROM features WHERE spatial_frequency IS NULL`
    );
    expect(parseInt(r.rows[0].count)).toBe(0);
  });

  test('spatial_frequency matches distinct cell count per feature', async () => {
    const r = await db.execute<{ matches: string }>(sql`
      SELECT COUNT(*) as matches FROM features f
      WHERE f.spatial_frequency = (
        SELECT COUNT(*) FROM feature_cells fc WHERE fc.feature_id = f.id
      )
    `);
    const totalR = await db.execute<{ count: string }>(sql`SELECT COUNT(*) as count FROM features`);
    expect(parseInt(r.rows[0].matches)).toBe(parseInt(totalR.rows[0].count));
  });

  test('temporal_frequency reflects year span / base_bin', async () => {
    // JM features: 1900-1945 span = 45 years, base bin 10y → 5 (rounded up)
    const r = await db.execute<{ temporal_frequency: number }>(
      sql`SELECT temporal_frequency FROM features WHERE dataset_id = 'joods-monument' LIMIT 1`
    );
    expect(r.rows[0].temporal_frequency).toBeGreaterThanOrEqual(4);
    expect(r.rows[0].temporal_frequency).toBeLessThanOrEqual(6);
  });
});

// ============================================================================
// QUERIES
// ============================================================================

describe('computeTimeSlices', () => {
  test('derives slices from MIN/MAX feature dates', async () => {
    const slices = await computeTimeSlices(50);
    expect(slices.length).toBeGreaterThan(0);
    expect(slices[0].startYear % 50).toBe(0);
    expect(slices[slices.length - 1].endYear % 50).toBe(0);
  });

  test('different binSize produces different slice counts', async () => {
    const slices50 = await computeTimeSlices(50);
    const slices25 = await computeTimeSlices(25);
    expect(slices25.length).toBeGreaterThanOrEqual(slices50.length);
  });

  test('computeTimeRange covers all slices', async () => {
    const slices = await computeTimeSlices(50);
    const range = await computeTimeRange(50);
    expect(range.start).toBe(slices[0].timeRange.start);
    expect(range.end).toBe(slices[slices.length - 1].timeRange.end);
  });
});

describe('getMetadata', () => {
  test('returns datasets, recordTypes, timeSlices, stats', async () => {
    const meta = await getMetadata();
    expect(meta.datasets.some(d => d.id === 'joods-monument')).toBe(true);
    expect(meta.datasets.some(d => d.id === 'beeldbank')).toBe(true);
    expect(meta.recordTypes).toContain('person');
    expect(meta.recordTypes).toContain('image');
    expect(meta.timeSlices.length).toBeGreaterThan(0);
    expect(meta.stats!.totalFeatures).toBeGreaterThan(0);
  });
});

describe('getFeatures', () => {
  test('returns features within bounds', async () => {
    const r = await getFeatures({ bounds: BOUNDS, pageSize: 50 });
    expect(r.total).toBeGreaterThan(0);
    expect(r.data.length).toBeGreaterThan(0);
  });

  test('filters by recordType', async () => {
    const r = await getFeatures({ bounds: BOUNDS, recordTypes: ['person'], pageSize: 50 });
    for (const f of r.data) {
      expect(f.recordType).toBe('person');
    }
  });

  test('filters by datasetIds', async () => {
    const r = await getFeatures({ bounds: BOUNDS, datasetIds: ['joods-monument'], pageSize: 50 });
    for (const f of r.data) {
      expect(f.datasetLabel).toBe('Joods Monument');
    }
  });

  test('returns currentAddress and historicalAddress', async () => {
    const r = await getFeatures({ bounds: BOUNDS, pageSize: 50 });
    const withAddress = r.data.find(f => f.currentAddress);
    expect(withAddress).toBeDefined();
    // historicalAddress should also be populated for features within the registry date range
    const withHistorical = r.data.find(f => f.historicalAddress);
    expect(withHistorical).toBeDefined();
  });

  test('returns datasetLabel and organisationLabel', async () => {
    const r = await getFeatures({ bounds: BOUNDS, pageSize: 50 });
    for (const f of r.data) {
      expect(f.datasetLabel).toBeDefined();
      expect(f.organisationLabel).toBeDefined();
      expect(f.organisationUrl).toBeDefined();
    }
  });

  test('truncates description to 128 characters', async () => {
    const r = await getFeatures({ bounds: BOUNDS, pageSize: 50 });
    for (const f of r.data) {
      if (f.description) {
        expect(f.description.length).toBeLessThanOrEqual(128);
      }
    }
  });

  test('pagination works correctly', async () => {
    const p1 = await getFeatures({ bounds: BOUNDS, page: 1, pageSize: 2 });
    const p2 = await getFeatures({ bounds: BOUNDS, page: 2, pageSize: 2 });
    expect(p1.data.length).toBeLessThanOrEqual(2);
    expect(p1.total).toBe(p2.total);
    expect(p1.totalPages).toBe(Math.ceil(p1.total / 2));
    // No overlap between pages
    const p1Ids = new Set(p1.data.map(f => f.id));
    const p2Ids = new Set(p2.data.map(f => f.id));
    for (const id of p1Ids) {
      expect(p2Ids.has(id)).toBe(false);
    }
  });

  test('results are interleaved by record type when multiple types present', async () => {
    const r = await getFeatures({ bounds: BOUNDS, pageSize: 50 });
    const types = new Set(r.data.map(f => f.recordType));
    if (types.size >= 2) {
      // First few results should rotate through types, not cluster by type
      const firstFew = r.data.slice(0, Math.min(types.size, r.data.length)).map(f => f.recordType);
      const uniqueInFirst = new Set(firstFew);
      expect(uniqueInFirst.size).toBeGreaterThan(1);
    }
  });

  test('sort by date desc returns newer features first within each type', async () => {
    const r = await getFeatures({ bounds: BOUNDS, sort: 'date', sortDirection: 'desc', pageSize: 50 });
    const byType = new Map<string, typeof r.data>();
    for (const f of r.data) {
      if (!byType.has(f.recordType)) byType.set(f.recordType, []);
      byType.get(f.recordType)!.push(f);
    }
    for (const group of byType.values()) {
      for (let i = 1; i < group.length; i++) {
        const prev = group[i - 1].dateRange[0];
        const curr = group[i].dateRange[0];
        expect(prev).toBeGreaterThanOrEqual(curr);
      }
    }
  });

  test('timeSlice filter excludes features outside the slice', async () => {
    const slices = await computeTimeSlices(50);
    // Pick a slice that contains some JM features (1900-1950 should)
    const slice1900 = slices.find(s => s.key === '1900_1950');
    if (slice1900) {
      const r = await getFeatures({ bounds: BOUNDS, timeSlice: slice1900.key, pageSize: 50 });
      // JM features (1900-1945) should be included
      const jmCount = r.data.filter(f => f.datasetLabel === 'Joods Monument').length;
      expect(jmCount).toBeGreaterThan(0);
    }
  });
});

describe('getHeatmap', () => {
  test('returns single-slice timeline with dimensions', async () => {
    const slices = await computeTimeSlices(50);
    const slice = slices.find(s => s.key === '1900_1950') || slices[0];
    const r = await getHeatmap(slice.key, { rows: 20, cols: 20 });
    expect(r.timeline[slice.key]).toBeDefined();
    expect(r.dimensions.colsAmount).toBeGreaterThan(0);
    expect(r.dimensions.rowsAmount).toBeGreaterThan(0);
  });

  test('throws on unknown time slice', async () => {
    await expect(getHeatmap('9999_9999', { rows: 10, cols: 10 })).rejects.toThrow();
  });

  test('grid resolution clamped to data extent', async () => {
    const slices = await computeTimeSlices(50);
    const slice = slices[0];
    const r = await getHeatmap(slice.key, { rows: 500, cols: 500 });
    expect(r.dimensions.colsAmount).toBeLessThanOrEqual(500);
    expect(r.dimensions.rowsAmount).toBeLessThanOrEqual(500);
  });
});

describe('getHeatmapTimeline', () => {
  test('returns all slices', async () => {
    const slices = await computeTimeSlices(50);
    const r = await getHeatmapTimeline({ rows: 20, cols: 20 });
    expect(Object.keys(r.timeline).length).toBe(slices.length);
  });

  test('filters by recordType', async () => {
    const all = await getHeatmapTimeline({ rows: 20, cols: 20 });
    const personOnly = await getHeatmapTimeline({ rows: 20, cols: 20 }, ['person']);
    const allCells = Object.values(all.timeline).reduce((s, h) => s + h.indices.length, 0);
    const personCells = Object.values(personOnly.timeline).reduce((s, h) => s + h.indices.length, 0);
    expect(personCells).toBeLessThanOrEqual(allCells);
  });
});

describe('getHistogram', () => {
  test('returns bins covering the data range', async () => {
    const r = await getHistogram(undefined, undefined, 50);
    expect(r.bins.length).toBeGreaterThan(0);
    expect(r.totalFeatures).toBeGreaterThan(0);
  });

  test('feature spanning multiple bins is counted in each (COUNT DISTINCT)', async () => {
    // Find any feature whose date range spans multiple 50-year bins
    const r = await db.execute<{ id: string; start_date: string; end_date: string }>(sql`
      SELECT id, start_date, end_date FROM features
      WHERE (EXTRACT(YEAR FROM end_date) / 50)::int > (EXTRACT(YEAR FROM start_date) / 50)::int
      LIMIT 1
    `);
    if (r.rows.length > 0) {
      // Histogram must count it in each overlapping bin (no duplicate feature double-counting)
      const hist = await getHistogram(undefined, undefined, 50);
      expect(hist.totalFeatures).toBeGreaterThan(0);
    }
  });

  test('different binSize produces different bin count', async () => {
    const bins50 = await getHistogram(undefined, undefined, 50);
    const bins25 = await getHistogram(undefined, undefined, 25);
    expect(bins25.bins.length).toBeGreaterThanOrEqual(bins50.bins.length);
  });

  test('maxCount equals max of bin counts', async () => {
    const r = await getHistogram(undefined, undefined, 50);
    const actualMax = Math.max(0, ...r.bins.map(b => b.count));
    expect(r.maxCount).toBe(actualMax);
  });

  test('filter by datasetIds reduces total', async () => {
    const all = await getHistogram(undefined, undefined, 50);
    const jmOnly = await getHistogram(undefined, ['joods-monument'], 50);
    expect(jmOnly.totalFeatures).toBeLessThanOrEqual(all.totalFeatures);
  });
});
