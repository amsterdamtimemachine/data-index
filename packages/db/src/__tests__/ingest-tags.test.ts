/**
 * Tags ingestion: classifier JSONL keyed by a dataset's natural keys, stamped with a
 * tagger id, replacing only that tagger's rows on rerun. The per-tag bitmaps
 * (tag_features) are rebuilt by rebuild-index, exercised here through its
 * buildTagFeatures step.
 *
 * Fixture tags.jsonl: k1 → bridge_canal + birds_eye_view, k2 → bridge_canal,
 * k3 → no tags, k9 → maps but no such feature, plus a duplicate k1 line, a blank
 * line and a malformed row. Features k1..k3 exist; k9 does not.
 */
import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { sql } from 'drizzle-orm';
import { resolve } from 'path';
import { setupTestDb, cleanTestDb, teardownTestDb, db } from './setup';
import { upsertSource } from '../etl/writers/feature-writer';
import { featureUuid } from '../etl/util/ids';
import { ingest } from '../etl/sources/tags';
import { buildTagFeatures } from '../etl/post-process/build-tag-features';

const DATASET = 'tg-ds';
const FILE = resolve(__dirname, 'fixtures/tags.jsonl');
const RERUN = resolve(__dirname, 'fixtures/tags-rerun.jsonl');
const K1 = featureUuid(DATASET, 'k1');
const K2 = featureUuid(DATASET, 'k2');
const K3 = featureUuid(DATASET, 'k3');

type TagRow = { feature_id: string; tag_id: string; source: string };

async function rowsFor(source: string): Promise<TagRow[]> {
  const r = await db.execute<TagRow>(sql`
    SELECT feature_id, tag_id, source FROM feature_tags WHERE source = ${source} ORDER BY feature_id, tag_id
  `);
  return r.rows;
}

/** tag_id → the feature_int_ids in its bitmap, resolved back to feature uuids. */
async function bitmapMembers(): Promise<Map<string, string[]>> {
  const r = await db.execute<{ tag_id: string; ids: string[] }>(sql`
    SELECT tf.tag_id, array_agg(f.id::text ORDER BY f.id::text) AS ids
    FROM tag_features tf
    JOIN features f ON f.feature_int_id = ANY(rb_to_array(tf.feature_ids))
    GROUP BY tf.tag_id
  `);
  return new Map(r.rows.map(x => [x.tag_id, x.ids]));
}

describe('tags ingestion', () => {
  beforeAll(async () => {
    await setupTestDb();
    await cleanTestDb();
    await upsertSource({
      organisation: { id: 'tg-org', label: 'TG Org' },
      dataset: { id: DATASET, label: 'TG DS' },
    });
    await db.execute(sql`
      INSERT INTO features (id, url, record_type, label, start_date, end_date, dataset_id) VALUES
        (${K1}, 'u1', 'image', 'k1', '1950-01-01', '1950-12-31', ${DATASET}),
        (${K2}, 'u2', 'image', 'k2', '1950-01-01', '1950-12-31', ${DATASET}),
        (${K3}, 'u3', 'image', 'k3', '1950-01-01', '1950-12-31', ${DATASET})
    `);
  });

  afterAll(async () => {
    await cleanTestDb();
    await teardownTestDb();
  });

  test('refuses to run without a tagger and dataset, or for an unknown dataset', async () => {
    await expect(ingest(FILE, { tagger: 't' })).rejects.toThrow('--dataset');
    await expect(ingest(FILE, { dataset: DATASET })).rejects.toThrow('--tagger');
    await expect(ingest(FILE, { tagger: 't', dataset: 'nope' })).rejects.toThrow("Unknown dataset 'nope'");
  });

  test('refuses a file type it cannot stream', async () => {
    await expect(ingest(resolve(__dirname, 'fixtures/lps.ttl'), { tagger: 't', dataset: DATASET })).rejects.toThrow('.jsonl');
  });

  test('writes one row per matched feature and tag, and reports the rest', async () => {
    const report = await ingest(FILE, { tagger: 'siglip-test', dataset: DATASET });
    expect(report).toEqual({ records: 4, invalid: 1, untagged: 1, matched: 2, unmatched: 1, rows: 3 });

    const rows = await rowsFor('siglip-test');
    expect(rows.map(r => [r.feature_id, r.tag_id])).toEqual(
      [[K1, 'birds_eye_view'], [K1, 'bridge_canal'], [K2, 'bridge_canal']].sort()
    );
  });

  test('upserts the vocabulary only for tags that landed on a feature', async () => {
    const r = await db.execute<{ id: string; label: string }>(sql`SELECT id, label FROM tags ORDER BY id`);
    expect(r.rows).toEqual([
      { id: 'birds_eye_view', label: 'birds eye view' },
      { id: 'bridge_canal', label: 'bridge canal' },
    ]);
  });

  test('rebuild-index fills tag_features with one bitmap per tag holding exactly the tagged features', async () => {
    expect((await bitmapMembers()).size).toBe(0); // not built by the ingest itself
    await buildTagFeatures();
    const members = await bitmapMembers();
    expect(members.get('bridge_canal')).toEqual([K1, K2].sort());
    expect(members.get('birds_eye_view')).toEqual([K1]);
    expect(members.size).toBe(2);
  });

  test('a second tagger adds rows beside the first', async () => {
    const report = await ingest(FILE, { tagger: 'other-model', dataset: DATASET });
    expect(report.rows).toBe(3);
    expect((await rowsFor('siglip-test')).length).toBe(3);
    expect((await rowsFor('other-model')).length).toBe(3);
  });

  test('rerunning a tagger replaces only its own rows and refreshes the bitmaps', async () => {
    const report = await ingest(RERUN, { tagger: 'siglip-test', dataset: DATASET });
    expect(report).toEqual({ records: 2, invalid: 0, untagged: 1, matched: 1, unmatched: 0, rows: 1 });

    expect((await rowsFor('siglip-test')).map(r => [r.feature_id, r.tag_id])).toEqual([[K1, 'maps']]);
    expect((await rowsFor('other-model')).length).toBe(3);

    // Bitmaps are the union over taggers: bridge_canal survives via other-model, maps is new.
    await buildTagFeatures();
    const members = await bitmapMembers();
    expect(members.get('bridge_canal')).toEqual([K1, K2].sort());
    expect(members.get('birds_eye_view')).toEqual([K1]);
    expect(members.get('maps')).toEqual([K1]);
  });
});
