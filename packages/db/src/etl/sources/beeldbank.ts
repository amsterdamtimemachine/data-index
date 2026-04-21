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
    .values({ id: 'stadsarchief', label: 'Amsterdam Stadsarchief', url: 'https://archief.amsterdam' })
    .onConflictDoNothing();

  await db.insert(datasets)
    .values({ id: 'beeldbank', label: 'Beeldbank', url: 'https://archief.amsterdam/beeldbank', organisationId: 'stadsarchief' })
    .onConflictDoNothing();

  await db.insert(relation)
    .values({ id: 'isAbout', label: 'Is About' })
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

  const seenFeatures = new Map<string, string>();
  const seenLinks = new Set<string>();
  let featureCount = 0;
  let linkCount = 0;
  let skippedLinks = 0;
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

  const csvParser = createReadStream(filePath)
    .pipe(parse({ columns: true, relax_column_count: true, bom: true }));

  for await (const row of csvParser as AsyncIterable<RawRow>) {
    const sourceUrl = row.resource?.trim();
    if (!sourceUrl) continue;

    let featureId = seenFeatures.get(sourceUrl);

    if (!featureId) {
      featureId = crypto.randomUUID();
      seenFeatures.set(sourceUrl, featureId);

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

      featureBatch.push({
        id: featureId,
        url: sourceUrl,
        recordType: 'image',
        label: name,
        contentUrl,
        startDate,
        endDate,
        datasetId: 'beeldbank',
        entity
      });

      featureCount++;
    }

    const adamlinkUri = row.address?.trim();
    if (adamlinkUri) {
      const linkKey = `${featureId}|${adamlinkUri}`;
      if (!seenLinks.has(linkKey)) {
        seenLinks.add(linkKey);
        const placeId = await resolvePlaceId(adamlinkUri);
        if (placeId) {
          linkBatch.push({ featureId, placeId, relationId: 'isAbout' });
          linkCount++;
        } else {
          skippedLinks++;
        }
      }
    }

    if (featureBatch.length >= BATCH_SIZE || linkBatch.length >= BATCH_SIZE) {
      await flush();
    }

    rowCount++;
    if (rowCount % 10000 === 0) {
      process.stdout.write(`\r  ${rowCount} rows, ${featureCount} features, ${linkCount} links, ${skippedLinks} skipped`);
    }
  }

  await flush();

  console.log(`\nDone: ${featureCount} features, ${linkCount} links, ${skippedLinks} skipped (no matching place)`);
}
