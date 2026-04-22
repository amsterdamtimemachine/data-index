/**
 * Import Beeldbank (Amsterdam Stadsarchief image archive) features
 *
 * Streams a CSV where each row is one (image × place-link). Same `resource`
 * can appear on multiple rows for different linked places. Dedups features
 * by `resource`, links to place via `address` column → adamlink URI → place.
 *
 * Usage: bun run db:ingest -s beeldbank -f <path-to-beeldbank.csv>
 */
import { createReadStream } from 'fs';
import { parse } from 'csv-parse';
import { sql } from 'drizzle-orm';
import { db } from '../../client';
import { organisations, datasets, relation, features, featureToPlace, address } from '../../schema';
import type { MediaObjectEntity } from '@atm/shared';
import { formatDateRange } from '../utils';

// ═══════════════════════════════════════════════════════════════
//  Organisation
// ═══════════════════════════════════════════════════════════════
const ORG_ID = 'stadsarchief';
const ORG_LABEL = 'Amsterdam Stadsarchief';
const ORG_URL = 'https://archief.amsterdam';

// ═══════════════════════════════════════════════════════════════
//  Dataset
// ═══════════════════════════════════════════════════════════════
const DATASET_ID = 'beeldbank';
const DATASET_LABEL = 'Beeldbank';
const DATASET_URL = 'https://archief.amsterdam/beeldbank';

// ═══════════════════════════════════════════════════════════════
//  Feature metadata
// ═══════════════════════════════════════════════════════════════
const RECORD_TYPE = 'image';
const RELATION_ID = 'isAbout';
const RELATION_LABEL = 'Is About';

const BATCH_SIZE = 1000;

interface RawRow {
  resource: string;
  title: string;
  thumbnail: string;
  creationDateItem: string;
  startDate: string;
  endDate: string;
  textDate: string;
  pand: string;
  address: string;
  street: string;
}

type PlaceRow = { place_id: string };

export async function ingest(filePath: string) {
  await db.insert(organisations)
    .values({ id: ORG_ID, label: ORG_LABEL, url: ORG_URL })
    .onConflictDoNothing();

  await db.insert(datasets)
    .values({ id: DATASET_ID, label: DATASET_LABEL, url: DATASET_URL, organisationId: ORG_ID })
    .onConflictDoNothing();

  await db.insert(relation)
    .values({ id: RELATION_ID, label: RELATION_LABEL })
    .onConflictDoNothing();

  console.log(`Streaming ${filePath}...`);

  const placeIdCache = new Map<string, string | null>();
  async function resolvePlaceId(adamlinkUri: string): Promise<string | null> {
    const cached = placeIdCache.get(adamlinkUri);
    if (cached !== undefined) return cached;

    const result = await db.execute<PlaceRow>(
      sql`SELECT ${address.placeId} as place_id FROM ${address} WHERE ${address.id} = ${adamlinkUri}`
    );
    const placeId = result.rows[0]?.place_id || null;
    placeIdCache.set(adamlinkUri, placeId);
    return placeId;
  }

  // Feature data is buffered per resource until we see a row whose `address`
  // resolves to a place. Resources that never get a resolving address (only
  // `street`/`pand` links) stay in the pending map and never hit the DB.
  const pendingFeatures = new Map<string, any>();
  const committedFeatures = new Map<string, string>(); // resource → featureId
  const seenLinks = new Set<string>();
  let featureCount = 0;
  let linkCount = 0;
  let skippedLinks = 0;
  let droppedResources = 0;
  let rowCount = 0;

  let featureBatch: any[] = [];
  let linkBatch: { featureId: string; placeId: string; relationId: string }[] = [];

  async function flush() {
    if (featureBatch.length > 0) {
      await db.insert(features).values(featureBatch).onConflictDoNothing();
      featureBatch = [];
    }
    if (linkBatch.length > 0) {
      await db.insert(featureToPlace).values(linkBatch).onConflictDoNothing();
      linkBatch = [];
    }
  }

  function buildFeatureData(row: RawRow) {
    const name = row.title?.trim() || '';
    const contentUrl = row.thumbnail?.trim() || '';
    const startDate = row.startDate?.trim() || null;
    const endDate = row.endDate?.trim() || startDate;
    const dateCreatedFormatted = formatDateRange(startDate, endDate);

    const entity: MediaObjectEntity = {
      type: 'MediaObject',
      name,
      contentUrl,
      ...(dateCreatedFormatted && { dateCreated: dateCreatedFormatted })
    };

    return {
      url: row.resource.trim(),
      recordType: RECORD_TYPE,
      label: name,
      contentUrl,
      startDate,
      endDate,
      datasetId: DATASET_ID,
      entity
    };
  }

  const csvParser = createReadStream(filePath)
    .pipe(parse({ columns: true, relax_column_count: true, bom: true }));

  for await (const row of csvParser as AsyncIterable<RawRow>) {
    const sourceUrl = row.resource?.trim();
    if (!sourceUrl) continue;

    const adamlinkUri = row.address?.trim();
    let placeId: string | null = null;
    if (adamlinkUri) {
      placeId = await resolvePlaceId(adamlinkUri);
      if (!placeId) skippedLinks++;
    }

    let featureId = committedFeatures.get(sourceUrl);

    if (!featureId) {
      // Not yet committed. Remember the feature data, commit only if this row
      // (or a later one) brings a resolving address.
      if (!pendingFeatures.has(sourceUrl)) {
        pendingFeatures.set(sourceUrl, buildFeatureData(row));
        droppedResources++; // provisionally — decremented on commit
      }
      if (!placeId) continue;

      featureId = crypto.randomUUID();
      featureBatch.push({ id: featureId, ...pendingFeatures.get(sourceUrl)! });
      committedFeatures.set(sourceUrl, featureId);
      pendingFeatures.delete(sourceUrl);
      featureCount++;
      droppedResources--;
    }

    if (placeId) {
      const linkKey = `${featureId}|${adamlinkUri}`;
      if (!seenLinks.has(linkKey)) {
        seenLinks.add(linkKey);
        linkBatch.push({ featureId, placeId, relationId: RELATION_ID });
        linkCount++;
      }
    }

    if (featureBatch.length >= BATCH_SIZE || linkBatch.length >= BATCH_SIZE) {
      await flush();
    }

    rowCount++;
    if (rowCount % 10000 === 0) {
      process.stdout.write(`\r  ${rowCount} rows, ${featureCount} features, ${linkCount} links, ${skippedLinks} skipped, ${droppedResources} pending-unlinked`);
    }
  }

  await flush();

  console.log(`\nDone: ${featureCount} features, ${linkCount} links, ${skippedLinks} skipped (no matching place), ${droppedResources} resources dropped (no address link)`);
}
