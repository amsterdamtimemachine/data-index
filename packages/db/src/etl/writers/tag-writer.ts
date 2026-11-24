/**
 * Tag-side DB writer: batch feature_tags rows for one tagger, joined to features so
 * only rows whose feature exists land, and upserting each batch's vocabulary into
 * tags first. Used by the tags source (sources/tags.ts).
 *
 * Replace semantics: clear() deletes the tagger's previous rows for the dataset,
 * then batches insert, so one tagger run over two datasets is two files that leave
 * each other alone. Unlike the feature writer's upsert, an interrupted replace would leave
 * the tagger with a fraction of its rows, so the source runs the whole thing in
 * one transaction and hands it in as `executor`.
 */
import { sql } from 'drizzle-orm';
import { db } from '../../client';
import { agents, features, featureTags, tags } from '../../schema';

type Executor = Pick<typeof db, 'execute'>;
type MatchRow = { matched: string; unmatched: string };

export type TagWriteReport = {
  matched: number;   // features that received rows
  unmatched: number; // features referenced but absent (rows skipped)
  rows: number;      // feature_tags rows written
};

/** The classifier model behind a tags file, as a SoftwareAgent; a rerun refreshes its name and link. */
export async function upsertClassifier(executor: Executor, classifier: { id: string; label: string; url?: string }): Promise<void> {
  await executor.execute(sql`
    INSERT INTO ${agents} (id, kind, label, url)
    VALUES (${classifier.id}, 'SoftwareAgent', ${classifier.label}, ${classifier.url ?? null})
    ON CONFLICT (id) DO UPDATE SET kind = excluded.kind, label = excluded.label, url = excluded.url`);
}

export function createTagWriter(executor: Executor, tagger: string, dataset: string, batchSize = 10000) {
  let featureIds: string[] = [];
  let tagIds: string[] = [];
  const report: TagWriteReport = { matched: 0, unmatched: 0, rows: 0 };

  async function flush(): Promise<void> {
    if (featureIds.length === 0) return;
    // sql.param keeps each array one driver parameter; a bare array in the
    // template would expand to a comma list.
    const batch = sql`unnest(${sql.param(featureIds)}::uuid[], ${sql.param(tagIds)}::text[]) AS u(feature_id, tag_id)`;

    // Vocabulary first (FK), only for tags that land on an existing feature. The
    // label is a readable fallback; the UI translates by id.
    await executor.execute(sql`
      INSERT INTO ${tags} (id, label)
      SELECT DISTINCT u.tag_id, replace(u.tag_id, '_', ' ')
      FROM ${batch}
      JOIN ${features} f ON f.id = u.feature_id
      ON CONFLICT DO NOTHING
    `);
    const inserted = await executor.execute(sql`
      INSERT INTO ${featureTags} (feature_id, tag_id, source)
      SELECT u.feature_id, u.tag_id, ${tagger}
      FROM ${batch}
      JOIN ${features} f ON f.id = u.feature_id
      ON CONFLICT DO NOTHING
    `);
    report.rows += inserted.rowCount ?? 0;

    // A record's pairs never straddle a flush, so per-batch feature counts sum to
    // record-level counts.
    const match = await executor.execute<MatchRow>(sql`
      SELECT
        COUNT(DISTINCT u.feature_id) FILTER (WHERE f.id IS NOT NULL) AS matched,
        COUNT(DISTINCT u.feature_id) FILTER (WHERE f.id IS NULL) AS unmatched
      FROM unnest(${sql.param(featureIds)}::uuid[]) AS u(feature_id)
      LEFT JOIN ${features} f ON f.id = u.feature_id
    `);
    report.matched += parseInt(match.rows[0].matched);
    report.unmatched += parseInt(match.rows[0].unmatched);

    featureIds = [];
    tagIds = [];
  }

  return {
    /** Drop the tagger's previous rows for the dataset; call once before adding. */
    async clear(): Promise<void> {
      await executor.execute(sql`
        DELETE FROM ${featureTags} ft USING ${features} f
        WHERE ft.feature_id = f.id AND ft.source = ${tagger} AND f.dataset_id = ${dataset}`);
    },
    add(featureId: string, tagId: string): void {
      featureIds.push(featureId);
      tagIds.push(tagId);
    },
    async flushIfFull(): Promise<void> {
      if (featureIds.length >= batchSize) await flush();
    },
    flush,
    report(): TagWriteReport { return { ...report }; },
  };
}
