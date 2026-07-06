/**
 * Ingest NWB streets, adding only the ones Adamlink is missing.
 *
 * The fetcher writes ALL Amsterdam NWB streets (complete snapshot). Adamlink already
 * covers most Amsterdam streets, so here we drop any NWB street whose BAG openbare-ruimte
 * id Adamlink lists via owl:sameAs, plus streets with no bagOrl (uncrosswalkable
 * bridge/lock segments). What survives is the genuine gap-fill (incl. all Weesp streets,
 * whose 0457* openbare-ruimte ids Adamlink never covers).
 *
 * The Adamlink straten TTL is REQUIRED — without it every NWB street would duplicate
 * Adamlink, so this throws rather than silently over-inserting.
 *
 * Usage: bun run db:ingest -s nwb-streets -f <nwb-streets.geojson> -x <adamlinkstraten.ttl>
 */
import { readFileSync } from 'fs';
import { insertPlaces } from '../helpers';
import { readFeatures, pdokRow } from './pdok-places';

// NWB place ids are `nwb-<bagOrl>` (16-digit BAG openbare-ruimte) or `nwb-<gmeId>-<slug>`
// for segments without one. Only the former can be crosswalked to Adamlink.
const BAGORL_ID = /^nwb-(\d{16})$/;

// BAG openbare-ruimte ids (16-digit) Adamlink straten already covers, from its
// owl:sameAs links (<…/openbare-ruimte/<id>>). NWB streets sharing one are duplicates.
function adamlinkBagOrls(ttlPath: string): Set<string> {
  const ttl = readFileSync(ttlPath, 'utf8');
  return new Set([...ttl.matchAll(/openbare-ruimte\/(\d{16})/g)].map(m => m[1]));
}

export async function ingest(filePath: string, opts?: { adamlinkStreets?: string }) {
  if (!opts?.adamlinkStreets) {
    throw new Error(
      'nwb-streets ingest requires the Adamlink straten TTL to dedup against ' +
      '(-x/--adamlink-streets <path>). Without it every NWB street would duplicate Adamlink.'
    );
  }
  const exclude = adamlinkBagOrls(opts.adamlinkStreets);
  console.log(`Reading ${filePath}... (Adamlink covers ${exclude.size} openbare-ruimte ids)`);
  const features = readFeatures(readFileSync(filePath, 'utf8'));

  let dupBagOrl = 0;
  let noCrosswalk = 0;
  const kept = features.filter(f => {
    const m = f.properties.id.match(BAGORL_ID);
    if (!m) { noCrosswalk++; return false; }        // no bagOrl → bridge/lock, uncrosswalkable
    if (exclude.has(m[1])) { dupBagOrl++; return false; } // Adamlink already has this street
    return true;
  });

  const rows = kept.map(pdokRow);
  console.log(`Inserting ${rows.length} streets (skipped ${dupBagOrl} Adamlink duplicates + ${noCrosswalk} without a bagOrl)`);
  const inserted = await insertPlaces(rows, { sourceSrid: 28992, onConflict: 'replaceAll' });
  console.log(`\nDone: ${inserted} streets`);
}
