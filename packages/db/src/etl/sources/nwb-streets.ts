/**
 * Ingest NWB streets. Two jobs, both keyed off the BAG openbare-ruimte id (bagOrl):
 *
 *  - Gap-fill: streets absent from Adamlink entirely (incl. all Weesp streets) → inserted
 *    as `nwb-<bagOrl>` places, source = nwb.
 *  - Backfill: streets Adamlink *names* but has no line for → keep the Adamlink identity
 *    (id/name/dated names/url) and borrow the NWB line, recording geometry provenance
 *    (place_geometry.source = nwb) so it's clear the line isn't Adamlink's.
 *
 * Streets Adamlink already draws are skipped (true dedup), as are NWB segments with no
 * bagOrl (bridges/locks — uncrosswalkable). The Adamlink straten TTL is REQUIRED — without
 * it every NWB street would duplicate Adamlink, so this throws rather than over-insert.
 *
 * Usage: bun run db:ingest -s nwb-streets -f <nwb-streets.geojson> -x <adamlinkstraten.ttl>
 */
import { readFileSync } from 'fs';
import { insertPlaces, type PlaceInsert } from '../helpers/helpers';
import { readFeatures, pdokRow } from './pdok-places';
import { parseAdamlinkStreets, insertStreetNames, type AdamlinkStreet } from './adamlink-streets';

// NWB place ids are `nwb-<bagOrl>` (16-digit) or `nwb-<gmeId>-<slug>` for segments without
// one. Only the former can be crosswalked to Adamlink.
const BAGORL_ID = /^nwb-(\d{16})$/;
const bagViewer = (bagOrl: string) => `https://bagviewer.kadaster.nl/lvbag/bag-viewer/#?searchQuery=${bagOrl}`;

export async function ingest(filePath: string, opts?: { adamlinkStreets?: string }) {
  if (!opts?.adamlinkStreets) {
    throw new Error(
      'nwb-streets ingest requires the Adamlink straten TTL to dedup against ' +
      '(-x/--adamlink-streets <path>). Without it every NWB street would duplicate Adamlink.'
    );
  }

  // Classify Adamlink streets by bagOrl: those it already draws (skip) vs. those it names
  // but has no line for (backfill from NWB, keyed by bagOrl).
  const covered = new Set<string>();
  const backfill = new Map<string, AdamlinkStreet>();
  for (const s of parseAdamlinkStreets(readFileSync(opts.adamlinkStreets, 'utf8'))) {
    if (!s.bagOrl) continue;
    if (s.wkt) covered.add(s.bagOrl);
    else backfill.set(s.bagOrl, s);
  }
  console.log(`Reading ${filePath}... (Adamlink draws ${covered.size} streets, lacks a line for ${backfill.size})`);
  const features = readFeatures(readFileSync(filePath, 'utf8'));

  let dupBagOrl = 0, noCrosswalk = 0, backfilled = 0, gapFilled = 0;
  const rows: PlaceInsert[] = [];
  const backfilledStreets: AdamlinkStreet[] = [];
  for (const f of features) {
    const m = f.properties.id.match(BAGORL_ID);
    if (!m) { noCrosswalk++; continue; }              // no bagOrl → uncrosswalkable bridge/lock
    const bagOrl = m[1];
    if (covered.has(bagOrl)) { dupBagOrl++; continue; } // Adamlink already draws this street

    const adamStreet = backfill.get(bagOrl);
    if (adamStreet) {
      // Adamlink names this street but has no line: keep its identity, borrow the NWB line.
      rows.push({
        id: adamStreet.uri, type: 'street', label: adamStreet.prefLabel,
        source: 'adamlink', url: adamStreet.uri,
        wkt: pdokRow(f).wkt,
        geometrySource: 'nwb', geometryUrl: bagViewer(bagOrl),
      });
      backfilledStreets.push(adamStreet);
      backfilled++;
    } else {
      rows.push(pdokRow(f));   // genuine gap-fill: street absent from Adamlink
      gapFilled++;
    }
  }

  console.log(`Inserting ${rows.length} streets (${backfilled} Adamlink backfills + ${gapFilled} gap-fills; skipped ${dupBagOrl} already drawn + ${noCrosswalk} without a bagOrl)`);
  const inserted = await insertPlaces(rows, { sourceSrid: 28992, onConflict: 'replaceAll' });
  const nameCount = await insertStreetNames(backfilledStreets);
  console.log(`\nDone: ${inserted} streets, ${nameCount} backfilled name variants`);
}
