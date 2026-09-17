/**
 * Classifier output for an already-ingested dataset: one JSONL row per record,
 * `{"id": <the dataset's natural key>, "tags": ["<tag id>", ...]}`; other fields
 * are ignored. Feature ids derive from --dataset + id exactly as that dataset's
 * ingestor derives them, so rows join features by primary key. Rows are stamped
 * with --tagger as their source and a rerun replaces only that source's rows.
 * Like every source, follow it with rebuild-index (which rebuilds tag_features).
 *
 * Usage: bun run db:ingest -s tags -f <file.jsonl> --tagger <id> --dataset <dataset-id>
 */
import { eq } from 'drizzle-orm';
import { db } from '../../client';
import { datasets } from '../../schema';
import { FileReader } from '../ingest/file-reader';
import { featureUuid } from '../util/ids';
import { createTagWriter, type TagWriteReport } from '../writers/tag-writer';

type TagRecord = { id: string; tags: string[] };

export type TagsIngestOptions = { tagger?: string; dataset?: string };

export type TagsIngestReport = TagWriteReport & {
  records: number;  // distinct ids read
  invalid: number;  // rows without a string id and a tags array
  untagged: number; // records with an empty tags array
};

export async function ingest(filePath: string, opts: TagsIngestOptions = {}): Promise<TagsIngestReport> {
  const { tagger, dataset } = opts;
  if (!tagger || !dataset) {
    throw new Error('The tags source needs --tagger <id> and --dataset <dataset-id>');
  }

  const known = await db.select({ id: datasets.id }).from(datasets).where(eq(datasets.id, dataset));
  if (known.length === 0) {
    throw new Error(`Unknown dataset '${dataset}': ingest it before its tags`);
  }

  const rows = new FileReader<TagRecord>().createFileReadStream(filePath);
  if (!rows) {
    throw new Error(`Unsupported file type for ${filePath}: expected .jsonl`);
  }

  let records = 0;
  let invalid = 0;
  let untagged = 0;
  const seen = new Set<string>();

  const written = await db.transaction(async (tx) => {
    const writer = createTagWriter(tx, tagger);
    await writer.clear();

    for await (const row of rows) {
      if (typeof row?.id !== 'string' || !Array.isArray(row.tags)) { invalid++; continue; }
      if (seen.has(row.id)) continue;
      seen.add(row.id);
      records++;

      const tagSet = new Set(row.tags.filter((t): t is string => typeof t === 'string' && t !== ''));
      if (tagSet.size === 0) { untagged++; continue; }

      const featureId = featureUuid(dataset, row.id);
      for (const tag of tagSet) writer.add(featureId, tag);
      await writer.flushIfFull();
    }
    await writer.flush();
    return writer.report();
  });

  const report = { ...written, records, invalid, untagged };
  console.log(`\nDone: ${report.rows} tag rows for tagger '${tagger}' on ${report.matched} ${dataset} features`);
  console.log(`  records ${records} — untagged ${untagged}, unmatched ${report.unmatched}` +
    (invalid ? `, invalid ${invalid}` : ''));
  return report;
}
