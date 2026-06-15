/**
 * Example: Ingesting a dataset located at neighbourhood / district (buurt / wijk) level
 *
 * Use this template when your source records describe a whole neighbourhood or
 * district rather than a point or street — e.g. a statistic or survey for an area.
 * Input is JSON. Each record names the area, its level (wijk/buurt), and a date; the
 * script resolves it to the matching `place` by:
 *   - place.type        = district (wijk) | neighbourhood (buurt)   ← from `level`
 *   - preferred_label    matched case-insensitively                 ← from `area`
 *   - the era whose [valid_since, valid_until) window contains the date
 * Records with no matching place are skipped (same as the point templates).
 *
 * The date is what selects the *system*: historical windows are bounded
 * (1600 wijken [1600,1850), 1850 buurten [1850,1909), 1909 buurten [1909,1921)) and
 * present-day CBS is open-ended. Because each historical era is a single granularity,
 * the date alone usually pins the system; `level` is what disambiguates wijk vs buurt
 * for the present-day CBS layer, where both exist at once.
 *
 * Neighbourhoods/districts have no `place_name` history, so the only label to match on
 * is `preferred_label` — there is no historical/alternative name for these.
 *
 * To use:
 * 1. Copy to packages/db/src/etl/sources/<your-dataset>.ts
 * 2. Fill in the Organisation / Dataset / Feature metadata blocks
 * 3. Adjust RawRecord to match your JSON structure + field mapping
 * 4. Run: bun run db:ingest -s <your-dataset> -f <path-to-file.json>
 */
import { readFileSync } from 'fs';
import { sql } from 'drizzle-orm';
import { db } from '../../client';
import type { PlaceIdRow } from '../../row-types';
import type { CreativeWorkEntity } from '@atm/shared';
import { upsertSource, createFeatureWriter, createCachedResolver, formatDateRange, featureUuid } from '../helpers';

// ═══════════════════════════════════════════════════════════════
//  Organisation
// ═══════════════════════════════════════════════════════════════
const ORG_ID = 'my-org';
const ORG_LABEL = 'My Organisation';
const ORG_URL = 'https://org-url.com';

// ═══════════════════════════════════════════════════════════════
//  Dataset
// ═══════════════════════════════════════════════════════════════
const DATASET_ID = 'my-dataset';
const DATASET_LABEL = 'My Dataset';
const DATASET_URL = 'https://dataset-url.com';

// ═══════════════════════════════════════════════════════════════
//  Feature metadata
// ═══════════════════════════════════════════════════════════════
const RECORD_TYPE = 'text'; // 'image' | 'text' | 'person'
const RELATION_ID = 'isAbout';
const RELATION_LABEL = 'Is About';

const BATCH_SIZE = 1000;

interface RawRecord {
  id: string;
  title: string;
  area: string;             // neighbourhood / district name → matched to place.preferred_label
  level: 'wijk' | 'buurt';  // → place.type (district / neighbourhood)
  date_start: string;       // "YYYY-MM-DD" — selects the era (which buurten/wijken system)
  date_end: string;
}

export async function ingest(filePath: string) {
  await upsertSource({
    organisation: { id: ORG_ID, label: ORG_LABEL, url: ORG_URL },
    dataset: { id: DATASET_ID, label: DATASET_LABEL, url: DATASET_URL },
    relation: { id: RELATION_ID, label: RELATION_LABEL },
  });

  // Resolve (level, area, date) → the place whose era window contains the date.
  // Cached by the (level|area|date) key since many rows reuse the same area+period.
  const resolvePlaceId = createCachedResolver(async (key) => {
    const { level, area, date } = JSON.parse(key) as { level: string; area: string; date: string };
    const type = level === 'wijk' ? 'district' : 'neighbourhood';
    const result = await db.execute<PlaceIdRow>(sql`
      SELECT id as place_id FROM place
      WHERE type = ${type}
        AND preferred_label ILIKE ${area}
        AND valid_since <= ${date}::date
        AND (valid_until IS NULL OR valid_until > ${date}::date)
      ORDER BY valid_since DESC
      LIMIT 1
    `);
    return result.rows[0]?.place_id ?? null;
  });

  const records = JSON.parse(readFileSync(filePath, 'utf8')) as RawRecord[];

  const writer = createFeatureWriter(BATCH_SIZE);
  let count = 0;
  let skipped = 0;

  for (const row of records) {
    if (!row.area || !row.level || !row.date_start) { skipped++; continue; }

    const placeId = await resolvePlaceId(
      JSON.stringify({ level: row.level, area: row.area, date: row.date_start })
    );
    if (!placeId) { skipped++; continue; }

    const featureId = featureUuid(row.id);
    const startDate = row.date_start || null;
    const endDate = row.date_end || startDate;
    const dateCreated = formatDateRange(startDate, endDate);

    const entity: CreativeWorkEntity = {
      type: 'CreativeWork',
      name: row.title || '',
      ...(dateCreated && { dateCreated })
    };

    writer.addFeature({
      id: featureId,
      url: row.id,
      recordType: RECORD_TYPE,
      label: row.title || '',
      startDate,
      endDate,
      datasetId: DATASET_ID,
      entity
    });
    writer.addLink({ featureId, placeId, relationId: RELATION_ID });
    count++;

    await writer.flushIfFull();
  }

  await writer.flush();
  console.log(`\nDone: ${count} features, ${skipped} skipped (no matching neighbourhood/district)`);
}
