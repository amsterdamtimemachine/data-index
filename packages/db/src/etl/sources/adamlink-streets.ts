/**
 * Shared parsing of the Adamlink straten TTL, used by both the `streets` source
 * (native streets, which have geometry) and the `nwb-streets` source (which backfills
 * geometry-less streets from NWB by bagOrl). Kept in one place so the geometry pick,
 * the dated-name extraction, and the owl:sameAs bagOrl crosswalk never drift apart.
 */
import { Parser } from 'n3';
import { createNameWriter } from '../helpers';

export interface StreetName {
  label: string;
  since: string | null;
  until: string | null;
}

export interface AdamlinkStreet {
  uri: string;
  prefLabel: string;
  names: StreetName[];
  wkt: string | null;    // current geometry, or null when Adamlink carries no line
  bagOrl: string | null; // BAG openbare-ruimte id (owl:sameAs), or null when uncrosswalkable
}

type Pred = { predicate: string; object: string };

// Pick the current geometry: prefer an undated node, else one without an end date, else
// the first. Returns null when the street has no geometry node at all.
function resolveWkt(preds: Pred[], subjects: Map<string, Pred[]>): string | null {
  const geomNodes = preds.filter(p => p.predicate.endsWith('hasGeometry'));
  if (geomNodes.length === 0) return null;

  for (const gn of geomNodes) {
    const gnPreds = subjects.get(gn.object) || [];
    const hasBegin = gnPreds.some(p => p.predicate.includes('EarliestBegin'));
    const hasEnd = gnPreds.some(p => p.predicate.includes('EarliestEnd'));
    const wkt = gnPreds.find(p => p.predicate.endsWith('asWKT'))?.object;
    if (!hasBegin && !hasEnd && wkt) return wkt;
  }
  for (const gn of geomNodes) {
    const gnPreds = subjects.get(gn.object) || [];
    const hasEnd = gnPreds.some(p => p.predicate.includes('EarliestEnd'));
    const wkt = gnPreds.find(p => p.predicate.endsWith('asWKT'))?.object;
    if (!hasEnd && wkt) return wkt;
  }
  return (subjects.get(geomNodes[0].object) || []).find(p => p.predicate.endsWith('asWKT'))?.object ?? null;
}

function resolveNames(preds: Pred[], subjects: Map<string, Pred[]>): StreetName[] {
  const names: StreetName[] = [];
  for (const nn of preds.filter(p => p.predicate.endsWith('/name'))) {
    const nnPreds = subjects.get(nn.object) || [];
    const label = nnPreds.find(p => p.predicate.endsWith('label'))?.object;
    if (!label) continue;
    const since = nnPreds.find(p => p.predicate.includes('EarliestBegin'))?.object || null;
    const until = nnPreds.find(p => p.predicate.includes('EarliestEnd'))?.object || null;
    if (since || until) names.push({ label, since, until });
  }
  return names;
}

function resolveBagOrl(preds: Pred[]): string | null {
  for (const p of preds) {
    if (!p.predicate.endsWith('sameAs')) continue;
    const m = p.object.match(/openbare-ruimte\/(\d{16})/);
    if (m) return m[1];
  }
  return null;
}

export function parseAdamlinkStreets(ttl: string): AdamlinkStreet[] {
  const subjects = new Map<string, Pred[]>();
  for (const q of new Parser().parse(ttl)) {
    if (!subjects.has(q.subject.value)) subjects.set(q.subject.value, []);
    subjects.get(q.subject.value)!.push({ predicate: q.predicate.value, object: q.object.value });
  }

  const out: AdamlinkStreet[] = [];
  for (const uri of subjects.keys()) {
    if (!uri.includes('/geo/street/')) continue;
    const preds = subjects.get(uri)!;
    const prefLabel = preds.find(p => p.predicate.endsWith('prefLabel'))?.object;
    if (!prefLabel) continue;
    out.push({
      uri,
      prefLabel,
      names: resolveNames(preds, subjects),
      wkt: resolveWkt(preds, subjects),
      bagOrl: resolveBagOrl(preds),
    });
  }
  return out;
}

// Write the dated name variants (place_historical_name) for a set of streets. Shared so
// backfilled streets get the same historical-name timeline native streets do.
export async function insertStreetNames(
  streets: Pick<AdamlinkStreet, 'uri' | 'names'>[],
  batchSize = 100,
): Promise<number> {
  const writer = createNameWriter(batchSize);
  let count = 0;
  for (const s of streets) {
    for (let i = 0; i < s.names.length; i++) {
      const n = s.names[i];
      writer.add({
        id: `${s.uri}#name-${i}`,
        placeId: s.uri,
        name: n.label,
        since: n.since ? `${n.since}-01-01` : null,
        until: n.until ? `${n.until}-01-01` : null,
        source: 'adamlink-straten',
      });
      count++;
      await writer.flushIfFull();
    }
  }
  await writer.flush();
  return count;
}
