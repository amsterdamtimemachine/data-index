/**
 * Example: Ingesting a dataset located at neighbourhood / district (buurt / wijk) level
 *
 * Use this template when your source records describe a whole neighbourhood or
 * district rather than a point or street — e.g. a statistic or survey for an area.
 * Input is JSON. Each record names the area, its level (wijk/buurt), and a date range;
 * the script resolves it to the matching `place` by:
 *   - place.type        = district (wijk) | neighbourhood (buurt)   ← from `level`
 *   - place.name matched case-insensitively                         ← from `area`
 *   - the geometry whose [since, until) window OVERLAPS the record's date range
 *     the most (the same range-overlap test the histogram/heatmap use)
 * Records with no matching place are skipped (same as the point templates).
 *
 * The date range selects the *system*: historical windows are bounded (1600 wijken
 * [1600,1850), 1850 buurten [1850,1909), 1909 buurten [1909,1921)) and present-day CBS
 * is open-ended. Because each historical era is a single granularity, the range usually
 * pins one system; `level` disambiguates wijk vs buurt for the present-day CBS layer,
 * where both exist at once. A range straddling a boundary attaches to whichever era it
 * overlaps most.
 *
 * Neighbourhoods/districts have no `place_historical_name` history, so the only label to
 * match on is `name` — there is no historical/alternative name for these.
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
import type { NewFeature } from '../../schema';
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
  description?: string;     // optional → features.description (shown on the card)
  author?: string;          // optional → an example of schema.org entity (JSONB) metadata
  area: string;             // neighbourhood / district name → matched to place.name
  level: 'wijk' | 'buurt';  // → place.type (district / neighbourhood)
  date_start: string;       // "YYYY-MM-DD" — with date_end, selects the era by range overlap
  date_end: string;
}

export async function ingest(filePath: string) {
  await upsertSource({
    organisation: { id: ORG_ID, label: ORG_LABEL, url: ORG_URL },
    dataset: { id: DATASET_ID, label: DATASET_LABEL, url: DATASET_URL },
    relation: { id: RELATION_ID, label: RELATION_LABEL },
  });

  // Resolve (level, area, [start,end]) → the era place whose [since, until)
  // window OVERLAPS the record's date range the most. The WHERE clause is the same
  // range-overlap test the rest of the app uses (featureYearOverlap); the ORDER BY then
  // breaks straddlers toward the era they overlap most (a 1905–1915 buurt feature lands
  // in the 1909 era, not the 1850 one). A point-in-time record has 0-day overlap but
  // still resolves to its containing era via the WHERE. Cached by (level|area|start|end).
  const resolvePlaceId = createCachedResolver(async (key) => {
    const { level, area, start, end } = JSON.parse(key) as { level: string; area: string; start: string; end: string };
    const type = level === 'wijk' ? 'district' : 'neighbourhood';
    const result = await db.execute<PlaceIdRow>(sql`
      SELECT p.id as place_id
      FROM place p
      JOIN place_geometry g ON g.place_id = p.id
      WHERE p.type = ${type}
        AND p.name ILIKE ${area}
        AND g.since <= ${end}::date
        AND (g.until IS NULL OR g.until > ${start}::date)
      ORDER BY GREATEST(
                 0,
                 LEAST(${end}::date, COALESCE(g.until, 'infinity'::date))
                   - GREATEST(${start}::date, g.since)
               ) DESC,
               g.since DESC
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
      JSON.stringify({ level: row.level, area: row.area, start: row.date_start, end: row.date_end || row.date_start })
    );
    if (!placeId) { skipped++; continue; }

    const featureId = featureUuid(row.id);
    const startDate = row.date_start || null;
    const endDate = row.date_end || startDate;
    const dateCreated = formatDateRange(startDate, endDate);

    // `entity` is the schema.org JSONB blob rendered in the feature detail view. Its
    // shape is the record_type's entity interface — CreativeWorkEntity here (text). Swap
    // for MediaObjectEntity (adds contentUrl) for images, or PersonEntity (birthDate,
    // birthPlace, …) for people, and populate whatever fields that type defines.
    const entity: CreativeWorkEntity = {
      type: 'CreativeWork',
      name: row.title || '',
      ...(row.author && { author: row.author }),
      ...(dateCreated && { dateCreated })
    };

    // Typed as NewFeature — the insert shape of the `features` table (schema.ts). Jump
    // to that type to see every available column (e.g. contentUrl, unused here). The
    // writer upserts it by id; rebuild-index fills temporal_frequency afterwards.
    const feature: NewFeature = {
      id: featureId,
      url: row.id,
      recordType: RECORD_TYPE,
      label: row.title || '',
      description: row.description || null,
      startDate,
      endDate,
      datasetId: DATASET_ID,
      entity
    };

    writer.addFeature(feature);
    writer.addLink({ featureId, placeId, relationId: RELATION_ID });
    count++;

    await writer.flushIfFull();
  }

  await writer.flush();
  console.log(`\nDone: ${count} features, ${skipped} skipped (no matching neighbourhood/district)`);
}
