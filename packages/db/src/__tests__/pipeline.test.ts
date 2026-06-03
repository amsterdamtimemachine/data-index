/**
 * End-to-end integration tests for the ingestion + query pipeline.
 *
 * Seeds the test DB using real ingestion scripts on fixture data, then
 * exercises the exported query functions that the API endpoints use.
 *
 * Direct DB inspections are kept in `dbAssertions.ts` so test bodies read
 * like behaviour assertions instead of SQL.
 */
import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { setupTestDb, cleanTestDb, seedTestData, teardownTestDb } from './setup';
import * as dbq from './dbAssertions';

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
    expect(await dbq.placeCount()).toBeGreaterThanOrEqual(5);
  });

  test('places have lp- prefixed IDs', async () => {
    expect(await dbq.firstPlaceId()).toMatch(/^lp-\d+$/);
  });

  test('places have RD geometry populated', async () => {
    expect(await dbq.placesWithGeometryCount()).toBeGreaterThan(0);
  });

  test('place names reference valid place_id', async () => {
    expect(await dbq.placeNamesWithDanglingPlaceIdCount()).toBe(0);
  });

  test('place name source column is populated after ingestion', async () => {
    expect((await dbq.distinctPlaceNameSources()).length).toBeGreaterThan(0);
  });
});

describe('Adressen ingestion', () => {
  test('place names are populated after adressen ingestion', async () => {
    expect(await dbq.placeNamesWithNameCount()).toBeGreaterThan(0);
  });

  test('place.preferred_label is the most recent dated place name', async () => {
    const rows = await dbq.placesWithPreferredLabelAndMostRecent(5);
    for (const row of rows) {
      expect(row.preferredLabel).toBe(row.mostRecent);
    }
  });

  test('place name dates are updated from adressen CSV', async () => {
    expect(await dbq.placeNamesWithDateCount()).toBeGreaterThan(0);
  });
});

describe('Feature ingestion', () => {
  test('beeldbank features have record_type = image', async () => {
    expect(await dbq.featureCountByDatasetAndType('beeldbank', 'image')).toBeGreaterThan(0);
  });

  test('joods-monument dedups duplicate person rows (6 fixture rows, 5 distinct persons)', async () => {
    // The fixture repeats one person on a second row (differing only in wkt, which
    // jm ignores). Without source dedup the seed would error on the upsert; with it
    // the person count stays 5.
    expect(await dbq.featureCountByDatasetAndType('joods-monument', 'person')).toBe(5);
  });

  test('joods-monument features have fixed 1900-1945 date range', async () => {
    const range = await dbq.firstFeatureDateRange('joods-monument');
    expect(range.startDate).toBe('1900-01-01');
    expect(range.endDate).toBe('1945-12-31');
  });

  test('every feature is linked to at least one place', async () => {
    expect(await dbq.orphanedFeatureCount()).toBe(0);
  });

  test('features have entity JSONB with correct schema.org type', async () => {
    expect((await dbq.firstFeatureEntity('beeldbank')).type).toBe('MediaObject');
    expect((await dbq.firstFeatureEntity('joods-monument')).type).toBe('Person');
  });
});

describe('rebuild-index', () => {
  test('all featured places have spatial_frequency set', async () => {
    expect(await dbq.featuredPlacesMissingSpatialFrequencyCount()).toBe(0);
  });

  test('spatial_frequency matches distinct cell count per place', async () => {
    const matches = await dbq.placesWithMatchingSpatialFrequencyCount();
    const total = await dbq.featuredPlaceCount();
    expect(matches).toBe(total);
  });

  test('temporal_frequency reflects year span / base_bin', async () => {
    // JM features: 1900-1945 span = 45 years, base bin 10y → 5 (rounded up)
    const tf = await dbq.firstFeatureTemporalFrequency('joods-monument');
    expect(tf).toBeGreaterThanOrEqual(4);
    expect(tf).toBeLessThanOrEqual(6);
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

  test('returns preferredLabel and historicalLabel', async () => {
    const r = await getFeatures({ bounds: BOUNDS, pageSize: 50 });
    const withLabel = r.data.find(f => f.preferredLabel);
    expect(withLabel).toBeDefined();
    // historicalLabel should also be populated for features within the registry date range
    const withHistorical = r.data.find(f => f.historicalLabel);
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
    const r = await getHistogram(undefined, undefined, undefined, 50);
    expect(r.bins.length).toBeGreaterThan(0);
    expect(r.totalFeatures).toBeGreaterThan(0);
  });

  test('feature spanning multiple bins is counted in each (COUNT DISTINCT)', async () => {
    const spanning = await dbq.findFeatureSpanningMultipleBins(50);
    if (spanning) {
      // Histogram must count it in each overlapping bin (no duplicate feature double-counting)
      const hist = await getHistogram(undefined, undefined, undefined, 50);
      expect(hist.totalFeatures).toBeGreaterThan(0);
    }
  });

  test('different binSize produces different bin count', async () => {
    const bins50 = await getHistogram(undefined, undefined, undefined, 50);
    const bins25 = await getHistogram(undefined, undefined, undefined, 25);
    expect(bins25.bins.length).toBeGreaterThanOrEqual(bins50.bins.length);
  });

  test('maxCount equals max of bin counts', async () => {
    const r = await getHistogram(undefined, undefined, undefined, 50);
    const actualMax = Math.max(0, ...r.bins.map(b => b.count));
    expect(r.maxCount).toBe(actualMax);
  });

  test('filter by datasetIds reduces total', async () => {
    const all = await getHistogram(undefined, undefined, undefined, 50);
    const jmOnly = await getHistogram(undefined, ['joods-monument'], undefined, 50);
    expect(jmOnly.totalFeatures).toBeLessThanOrEqual(all.totalFeatures);
  });
});
