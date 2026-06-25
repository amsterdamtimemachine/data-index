/**
 * Import Delpher newspaper articles
 *
 * Parses CSV of newspaper articles with geometry points.
 * Matches each point to the nearest address place via spatial lookup.
 * Unmatched features (no place within threshold) are skipped.
 *
 * Usage: bun run db:ingest -s delpher -f <path-to-delpher_newspapers.csv>
 */
import { createReadStream } from 'fs';
import { parse } from 'csv-parse';
import { sql } from 'drizzle-orm';
import { db } from '../../client';
import type { PlaceIdRow } from '../../row-types';
import type { CreativeWorkEntity } from '@atm/shared';
import { upsertSource, createFeatureWriter, createCachedResolver, formatDateRange, featureUuid } from '../helpers/helpers';
import { Ingestor, TargetRecord } from './ingestor';

interface DelpherSourceData {
  id: string;
  url: string;
  title: string;
  text: string;
  period: string;      // PostgreSQL range: "[1974-10-25,1974-10-26)"
  geom_wkt: string;    // "POINT(4.901959 52.376688)" WGS84
  dataset: string;
  tags: string;
}

export class Delpher extends Ingestor<DelpherSourceData> {
  protected ORG_ID = 'kb';
  protected ORG_LABEL = 'Koninklijke Bibliotheek';
  protected ORG_URL = 'https://www.kb.nl';

  protected DATASET_ID = 'delpher';
  protected DATASET_LABEL = 'Delpher Kranten';
  protected DATASET_URL = 'https://www.delpher.nl';

  protected RECORD_TYPE = 'text';
  protected RELATION_ID = 'isAbout';
  protected RELATION_LABEL = 'Is About';

  private parsePeriod(period: string): { startDate: string | null; endDate: string | null } {
    // Format: [start,end) — inclusive start, exclusive end
    const match = period.match(/[\[(\s]*(\d{4}-\d{2}-\d{2})\s*,\s*(\d{4}-\d{2}-\d{2})\s*[)\]]/);
    
    if (!match) {
      return { startDate: null,  endDate: null }
    };
    
    return { startDate: match[1], endDate: match[2]};
  }

  protected transform(source: DelpherSourceData): Omit<TargetRecord, 'area' | 'level'> & { area?: string; level?: string; } {
    const { startDate, endDate } = this.parsePeriod(source.period);
    
    return {
      id: featureUuid(source.url),
      url: source.url,
      contentUrl: source.url,
      title: source.title || '',
      description: source.text || '',
      startDate: startDate,
      endDate: endDate
    }
  }
}

// // ═══════════════════════════════════════════════════════════════
// //  Organisation
// // ═══════════════════════════════════════════════════════════════
// const ORG_ID = 'kb';
// const ORG_LABEL = 'Koninklijke Bibliotheek';
// const ORG_URL = 'https://www.kb.nl';

// // ═══════════════════════════════════════════════════════════════
// //  Dataset
// // ═══════════════════════════════════════════════════════════════
// const DATASET_ID = 'delpher';
// const DATASET_LABEL = 'Delpher Kranten';
// const DATASET_URL = 'https://www.delpher.nl';

// // ═══════════════════════════════════════════════════════════════
// //  Feature metadata
// // ═══════════════════════════════════════════════════════════════
// const RECORD_TYPE = 'text';
// const RELATION_ID = 'isAbout';
// const RELATION_LABEL = 'Is About';

// // ═══════════════════════════════════════════════════════════════
// //  Ingestion tuning
// // ═══════════════════════════════════════════════════════════════
// /** Max distance in meters to match a Delpher point to an existing place.
//  *  Based on dry run: 99.8% of Delpher points match within 5m. */
// const MATCH_THRESHOLD_METERS = 5;
// const BATCH_SIZE = 1000;

// interface RawRow {
//   id: string;
//   url: string;
//   title: string;
//   text: string;
//   period: string;      // PostgreSQL range: "[1974-10-25,1974-10-26)"
//   geom_wkt: string;    // "POINT(4.901959 52.376688)" WGS84
//   dataset: string;
//   tags: string;
// }

// /**
//  * Parse PostgreSQL range format "[1974-10-25,1974-10-26)" to start/end dates
//  */
// function parsePeriod(period: string): { startDate: string | null; endDate: string | null } {
//   // Format: [start,end) — inclusive start, exclusive end
//   const match = period.match(/[\[(\s]*(\d{4}-\d{2}-\d{2})\s*,\s*(\d{4}-\d{2}-\d{2})\s*[)\]]/);
//   if (!match) return { startDate: null, endDate: null };
//   return { startDate: match[1], endDate: match[2] };
// }

// export async function ingest(filePath: string) {
//   await upsertSource({
//     organisation: { id: ORG_ID, label: ORG_LABEL, url: ORG_URL },
//     dataset: { id: DATASET_ID, label: DATASET_LABEL, url: DATASET_URL },
//     relation: { id: RELATION_ID, label: RELATION_LABEL },
//   });

//   console.log(`Streaming ${filePath}...`);
//   console.log(`Match threshold: ${MATCH_THRESHOLD_METERS}m`);

//   // Nearest place within threshold, cached by WKT (many articles share a point).
//   const resolvePlaceId = createCachedResolver(async (wkt) => {
//     const result = await db.execute<PlaceIdRow>(sql`
//       SELECT p.id as place_id
//       FROM place p
//       WHERE ST_DWithin(
//         p.geometry,
//         ST_Transform(ST_GeomFromText(${wkt}, 4326), 28992),
//         ${MATCH_THRESHOLD_METERS}
//       )
//       ORDER BY p.geometry <-> ST_Transform(ST_GeomFromText(${wkt}, 4326), 28992)
//       LIMIT 1
//     `);
//     return result.rows[0]?.place_id ?? null;
//   });

//   const csvParser = createReadStream(filePath).pipe(
//     parse({ columns: true, relax_column_count: true, relax_quotes: true })
//   );

//   const writer = createFeatureWriter(BATCH_SIZE);
//   let featureCount = 0;
//   let linkCount = 0;
//   let skipped = 0;

//   for await (const row of csvParser as AsyncIterable<RawRow>) {
//     if (!row.geom_wkt || !row.url) continue;

//     const placeId = await resolvePlaceId(row.geom_wkt);
//     if (!placeId) {
//       skipped++;
//       continue;
//     }

//     const { startDate, endDate } = parsePeriod(row.period);
//     const dateCreated = formatDateRange(startDate, endDate);

//     const entity: CreativeWorkEntity = {
//       type: 'CreativeWork',
//       name: row.title || '',
//       url: row.url,
//       ...(dateCreated && { dateCreated })
//     };

//     const featureId = featureUuid(row.url);

//     writer.addFeature({
//       id: featureId,
//       url: row.url,
//       recordType: RECORD_TYPE,
//       label: row.title || '',
//       description: row.text || null,
//       contentUrl: row.url,
//       startDate,
//       endDate,
//       datasetId: DATASET_ID,
//       entity
//     });
//     writer.addLink({ featureId, placeId, relationId: RELATION_ID });
//     featureCount++;
//     linkCount++;

//     await writer.flushIfFull();

//     if ((featureCount + skipped) % 1000 === 0) {
//       process.stdout.write(`\r  ${featureCount} ingested, ${skipped} skipped`);
//     }
//   }

//   await writer.flush();

//   console.log(`\nDone: ${featureCount} features, ${linkCount} links, ${skipped} skipped (no place within ${MATCH_THRESHOLD_METERS}m)`);
// }