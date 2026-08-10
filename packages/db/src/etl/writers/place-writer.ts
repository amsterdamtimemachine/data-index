/**
 * Place-side DB writers: batch-insert place identity + geometry rows (with the RD
 * transform and re-ingest conflict modes), and batch place_historical_name rows.
 * Used by the place sources (adressen, streets, lps, pdok-places, …).
 */
import { sql } from 'drizzle-orm';
import { PLACE_PROVIDERS, type PlaceSource } from '@atm/shared';
import { db } from '../../client';
import {
  organisations,
  placeHistoricalName,
  place,
  placeGeometry,
  type NewPlaceHistoricalName,
} from '../../schema';

/**
 * Seed the place-provider organisations (Adamlink/CBS/NWB/BAG) that `place.source`
 * references. Idempotent; called by insertPlaces so every place has its provider row
 * before the foreign key is checked. The rows are a materialised copy of PLACE_PROVIDERS.
 */
async function upsertProviders(): Promise<void> {
  await db.insert(organisations)
    .values(Object.entries(PLACE_PROVIDERS).map(([id, { label, url }]) => ({ id, label, url })))
    .onConflictDoNothing();
}

/** Batched writer for place_historical_name rows. */
export function createNameWriter(batchSize = 1000) {
  let batch: NewPlaceHistoricalName[] = [];

  async function flush(): Promise<void> {
    if (batch.length === 0) return;
    await db.insert(placeHistoricalName).values(batch).onConflictDoNothing();
    batch = [];
  }

  return {
    add(name: NewPlaceHistoricalName): void { batch.push(name); },
    async flushIfFull(): Promise<void> { if (batch.length >= batchSize) await flush(); },
    flush,
  };
}

export interface PlaceInsert {
  id: string;
  type: string;
  label?: string | null;
  wkt: string;
  source?: PlaceSource | null;
  url?: string | null;
  // Geometry provenance, set only when the line comes from a different provider than the
  // place itself (e.g. an Adamlink street backfilled from NWB). Left undefined otherwise.
  geometrySource?: PlaceSource | null;
  geometryUrl?: string | null;
  // Period this geometry was the city's division — set only for neighbourhood/district.
  // Left undefined for address/street. Dates as 'YYYY-MM-DD'.
  since?: string | null;
  until?: string | null;
}

/**
 * How an existing place is refreshed when a re-ingest hits its id:
 *  - 'replaceAll'      : place type + name, and geometry + since/until
 *                        (streets / neighbourhoods / districts, from their TTL).
 *  - 'replaceGeometry' : place type + geometry only, preserving name and
 *                        since/until (LPS — the label is owned by adressen enrichment).
 */
export type PlaceConflict = 'replaceAll' | 'replaceGeometry';

/**
 * Batch-insert places + their geometry with a transform to RD (28992). Writes the
 * identity row to `place` and the geometry row to `place_geometry`.
 *
 * `sourceSrid` is the SRID of the incoming WKT: 28992 is inserted as-is, anything
 * else (e.g. 4326) is wrapped in ST_Transform. `onConflict` selects which columns
 * a re-ingest refreshes (see PlaceConflict). Returns the number of rows inserted.
 */
export async function insertPlaces(
  rows: PlaceInsert[],
  opts: { sourceSrid: number; onConflict: PlaceConflict; batchSize?: number }
): Promise<number> {
  const batchSize = opts.batchSize ?? 500;
  await upsertProviders(); // place.source FKs to these org rows

  // Geometry is PostGIS, so the column value is a sql ST_* expression; the rest
  // of the insert goes through Drizzle's builder. RD (28992) is stored as-is;
  // any other SRID is transformed to RD.
  const geom = (wkt: string) => opts.sourceSrid === 28992
    ? sql`ST_GeomFromText(${wkt}, 28992)`
    : sql`ST_Transform(ST_GeomFromText(${wkt}, ${opts.sourceSrid}), 28992)`;

  let inserted = 0;
  for (let i = 0; i < rows.length; i += batchSize) {
    const chunk = rows.slice(i, i + batchSize);

    // 1. Identity row in `place`.
    const placeQuery = db.insert(place).values(
      chunk.map(r => ({ id: r.id, type: r.type, name: r.label ?? null, source: r.source ?? null, url: r.url ?? null }))
    );
    if (opts.onConflict === 'replaceGeometry') {
      await placeQuery.onConflictDoUpdate({
        target: place.id,
        set: { type: sql`excluded.type` }, // preserve name, source, url
      });
    } else {
      await placeQuery.onConflictDoUpdate({
        target: place.id,
        set: { type: sql`excluded.type`, name: sql`excluded.name`, source: sql`excluded.source`, url: sql`excluded.url` },
      });
    }

    // 2. Geometry row in `place_geometry` (1:1 with place).
    const geomQuery = db.insert(placeGeometry).values(
      chunk.map(r => ({
        placeId: r.id,
        geometry: geom(r.wkt),
        source: r.geometrySource ?? null,
        url: r.geometryUrl ?? null,
        since: r.since ?? null,
        until: r.until ?? null,
      }))
    );
    if (opts.onConflict === 'replaceGeometry') {
      await geomQuery.onConflictDoUpdate({
        target: placeGeometry.placeId,
        // provenance travels with the geometry; period (since/until) is preserved
        set: { geometry: sql`excluded.geometry`, source: sql`excluded.source`, url: sql`excluded.url` },
      });
    } else {
      await geomQuery.onConflictDoUpdate({
        target: placeGeometry.placeId,
        set: {
          geometry: sql`excluded.geometry`,
          source: sql`excluded.source`,
          url: sql`excluded.url`,
          since: sql`excluded.since`,
          until: sql`excluded.until`,
        },
      });
    }

    inserted += chunk.length;
  }
  return inserted;
}
