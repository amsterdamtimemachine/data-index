/**
 * Import Beeldbank (Amsterdam Stadsarchief image archive) features
 *
 * Streams a large JSON file (~2.5GB) mapping Adamlink URIs to arrays of images.
 * Inserts features, creates source/relation records, and links features to places.
 *
 * Usage: bun run db:ingest -s beeldbank -f ../../data/beeldbank-fixed.json
 */
import { createReadStream } from 'fs';
import { parser } from 'stream-json';
import { streamObject } from 'stream-json/streamers/StreamObject';
import { db } from '../../client';
import { sources, relation, features, featureToPlace } from '../../schema';
import type { MediaObjectEntity } from '@atm/shared';
import { formatDateRange } from '../utils';

const BATCH_SIZE = 1000;

export async function ingest(filePath: string) {
  // Create source
  await db.insert(sources)
    .values({ id: 'beeldbank', label: 'Stadsarchief Amsterdam Beeldbank', url: 'https://archief.amsterdam/beeldbank' })
    .onConflictDoNothing();

  // Create relation
  await db.insert(relation)
    .values({ id: 'isAbout', label: 'Is About' })
    .onConflictDoNothing();

  console.log(`Streaming ${filePath}...`);

  // Map source URL → UUID for deduplication
  const seenFeatures = new Map<string, string>();
  let featureCount = 0;
  let linkCount = 0;
  let entryCount = 0;

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

  const pipeline = createReadStream(filePath)
    .pipe(parser())
    .pipe(streamObject());

  for await (const { key: adamlinkUri, value: val } of pipeline) {
    const images = (val as any).images || [];

    for (const img of images) {
      const sourceUrl = img['@id'];
      if (!sourceUrl) continue;

      let featureId = seenFeatures.get(sourceUrl);

      if (!featureId) {
        featureId = crypto.randomUUID();
        seenFeatures.set(sourceUrl, featureId);

        const name = img.name || '';
        const contentUrl = img.contentUrl || '';
        const startDate = img.startDate || null;
        const endDate = img.endDate || startDate;
        const dateCreatedFormatted = formatDateRange(startDate, endDate);

        const entity: MediaObjectEntity = {
          type: 'MediaObject',
          label: name,
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
          sourceId: 'beeldbank',
          entity
        });

        featureCount++;
      }

      linkBatch.push({ featureId, placeId: adamlinkUri, relationId: 'isAbout' });
      linkCount++;

      if (linkBatch.length >= BATCH_SIZE) {
        await flush();
      }
    }

    entryCount++;
    if (entryCount % 1000 === 0) {
      process.stdout.write(`\r  ${entryCount} addresses, ${featureCount} features, ${linkCount} links`);
    }
  }

  await flush();

  console.log(`\nDone: ${featureCount} features, ${linkCount} links`);
}
