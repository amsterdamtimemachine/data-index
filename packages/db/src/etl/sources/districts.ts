/**
 * Import district/neighbourhood polygons from Adamlink buurten TTL
 *
 * Parses the RDF file containing historical district systems and creates place
 * rows with polygon geometry. All entries get type='neighbourhood' (matching
 * the RDF type hg:Neighbourhood). CBS current entries are skipped.
 *
 * Usage: bun run db:ingest -s districts -f <path-to-adamlinkbuurten.ttl>
 */
import { readFileSync } from 'fs';
import { Parser } from 'n3';
import { insertPlaces } from '../helpers';

interface District {
  uri: string;
  label: string;
  wkt: string;
  beginYear: number;
  endYear: number | null;
}

function isHistorical(beginYear: number | null): boolean {
  return beginYear === 1600 || beginYear === 1850 || beginYear === 1909;
}

export async function ingest(filePath: string) {
  console.log(`Parsing ${filePath}...`);

  const ttl = readFileSync(filePath, 'utf8');
  const parser = new Parser();
  const quads = parser.parse(ttl);

  const labels = new Map<string, string>();
  const hasGeometry = new Map<string, string>();
  const blankToWkt = new Map<string, string>();
  const beginYears = new Map<string, number>();
  const endYears = new Map<string, number>();

  for (const q of quads) {
    const pred = q.predicate.value;
    const subj = q.subject.value;
    const obj = q.object.value;

    if (pred.endsWith('prefLabel') && subj.includes('/geo/district/')) {
      labels.set(subj, obj);
    } else if (pred.endsWith('hasGeometry')) {
      hasGeometry.set(subj, obj);
    } else if (pred.endsWith('asWKT')) {
      blankToWkt.set(subj, obj);
    } else if (pred.endsWith('hasEarliestBeginTimeStamp') && subj.includes('/geo/district/')) {
      beginYears.set(subj, parseInt(obj));
    } else if (pred.endsWith('hasEarliestEndTimeStamp') && subj.includes('/geo/district/')) {
      endYears.set(subj, parseInt(obj));
    }
  }

  const districts: District[] = [];
  let skippedCbs = 0;

  for (const [uri, blankNode] of hasGeometry) {
    if (!uri.includes('/geo/district/')) continue;
    const wkt = blankToWkt.get(blankNode);
    const label = labels.get(uri);
    if (!wkt || !label) continue;

    const beginYear = beginYears.get(uri) ?? null;

    if (!isHistorical(beginYear)) {
      skippedCbs++;
      continue;
    }

    districts.push({
      uri,
      label,
      wkt,
      beginYear: beginYear!,
      endYear: endYears.get(uri) ?? null,
    });
  }

  console.log(`Resolved ${districts.length} neighbourhoods (${skippedCbs} CBS skipped)`);

  const inserted = await insertPlaces(
    districts.map(d => ({ id: d.uri, type: 'neighbourhood', label: d.label, wkt: d.wkt })),
    { sourceSrid: 4326, onConflict: 'update' }
  );

  console.log(`\nDone: ${inserted} neighbourhood places`);
}
