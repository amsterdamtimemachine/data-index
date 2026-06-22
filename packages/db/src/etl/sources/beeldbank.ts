/**
 * Import Beeldbank (Amsterdam Stadsarchief image archive) features
 *
 * Streams a CSV where each row is one (image x place-link). Same `resource`
 * can appear on multiple rows for different linked places. Dedups features by
 * the archive object identifier (last path segment of `resource`); the stored
 * feature URL is the canonical resolver link built from that identifier.
 * Links to place using a cascade: address first, then street.
 * Features that resolve neither are dropped.
 *
 * Usage: bun run db:ingest -s beeldbank -f <path-to-beeldbank.csv>
 */
import { createReadStream } from 'fs';
import { parse } from 'csv-parse';
import { sql } from 'drizzle-orm';
import { db } from '../../client';
import { placeHistoricalName } from '../../schema';
import type { PlaceIdRow } from '../../row-types';
import type { MediaObjectEntity } from '@atm/shared';
import { upsertSource, createFeatureWriter, createCachedResolver, formatDateRange, featureUuid } from '../helpers';

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
const RESOLVER_BASE = 'https://id.archief.amsterdam';

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

export async function ingest(filePath: string) {
  await upsertSource({
    organisation: { id: ORG_ID, label: ORG_LABEL, url: ORG_URL },
    dataset: { id: DATASET_ID, label: DATASET_LABEL, url: DATASET_URL },
    relation: { id: RELATION_ID, label: RELATION_LABEL },
  });

  console.log(`Streaming ${filePath}...`);

  // Address and street resolvers keep separate caches; their URI key spaces don't overlap.
  const resolveByAddress = createCachedResolver(async (adamlinkUri) => {
    const result = await db.execute<PlaceIdRow>(
      sql`SELECT ${placeHistoricalName.placeId} as place_id FROM ${placeHistoricalName} WHERE ${placeHistoricalName.id} = ${adamlinkUri}`
    );
    return result.rows[0]?.place_id ?? null;
  });

  const resolveByStreet = createCachedResolver(async (streetUri) => {
    const result = await db.execute<PlaceIdRow>(
      sql`SELECT id as place_id FROM place WHERE id = ${streetUri} AND type = 'street'`
    );
    return result.rows[0]?.place_id ?? null;
  });

  const pendingFeatures = new Map<string, any>();
  const pendingStreetUris = new Map<string, Set<string>>();
  const committedFeatures = new Map<string, string>();
  const seenLinks = new Set<string>();
  let featureCount = 0;
  let linkCount = 0;
  let skippedLinks = 0;
  let streetLinkCount = 0;
  let droppedResources = 0;
  let rowCount = 0;

  const writer = createFeatureWriter(BATCH_SIZE);

  function buildFeatureData(row: RawRow, identifier: string) {
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
      url: `${RESOLVER_BASE}/${identifier}`,
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
    const resource = row.resource?.trim();
    if (!resource) continue;
    const identifier = resource.split('/').pop() ?? '';
    if (!identifier) continue;

    const adamlinkUri = row.address?.trim();
    let placeId: string | null = null;
    if (adamlinkUri) {
      placeId = await resolveByAddress(adamlinkUri);
      if (!placeId) skippedLinks++;
    }

    let featureId = committedFeatures.get(identifier);

    if (!featureId) {
      if (!pendingFeatures.has(identifier)) {
        pendingFeatures.set(identifier, buildFeatureData(row, identifier));
      }

      // Remember street URIs for the fallback pass
      const streetUri = row.street?.trim();
      if (streetUri) {
        if (!pendingStreetUris.has(identifier)) pendingStreetUris.set(identifier, new Set());
        pendingStreetUris.get(identifier)!.add(streetUri);
      }

      if (!placeId) continue;

      featureId = featureUuid(identifier);
      writer.addFeature({ id: featureId, ...pendingFeatures.get(identifier)! });
      committedFeatures.set(identifier, featureId);
      pendingFeatures.delete(identifier);
      pendingStreetUris.delete(identifier);
      featureCount++;
    }

    if (placeId) {
      const linkKey = `${featureId}|${adamlinkUri}`;
      if (!seenLinks.has(linkKey)) {
        seenLinks.add(linkKey);
        writer.addLink({ featureId, placeId, relationId: RELATION_ID });
        linkCount++;
      }
    }

    await writer.flushIfFull();

    rowCount++;
    if (rowCount % 10000 === 0) {
      process.stdout.write(`\r  ${rowCount} rows, ${featureCount} features, ${linkCount} address links, ${pendingFeatures.size} pending`);
    }
  }

  await writer.flush();

  // Street fallback: try to resolve pending features via their street URIs
  console.log(`\n\nStreet fallback: ${pendingFeatures.size} resources to try...`);
  let streetResolved = 0;

  for (const [identifier, featureData] of pendingFeatures) {
    const streetUris = pendingStreetUris.get(identifier);
    if (!streetUris) continue;

    let resolvedPlaceId: string | null = null;
    for (const streetUri of streetUris) {
      resolvedPlaceId = await resolveByStreet(streetUri);
      if (resolvedPlaceId) break;
    }

    if (resolvedPlaceId) {
      const featureId = featureUuid(identifier);
      writer.addFeature({ id: featureId, ...featureData });
      writer.addLink({ featureId, placeId: resolvedPlaceId, relationId: RELATION_ID });
      featureCount++;
      streetLinkCount++;
      streetResolved++;

      await writer.flushIfFull();
    }

    if (streetResolved % 1000 === 0 && streetResolved > 0) {
      process.stdout.write(`\r  ${streetResolved} resolved via street`);
    }
  }

  await writer.flush();

  droppedResources = pendingFeatures.size - streetResolved;

  console.log(`\n\nDone: ${featureCount} features (${linkCount} address links, ${streetLinkCount} street links), ${skippedLinks} skipped, ${droppedResources} dropped (no link)`);
}
