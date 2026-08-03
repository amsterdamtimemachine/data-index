/**
 * Import district + neighbourhood polygons from the Adamlink buurten TTL.
 *
 * The file holds Amsterdam's neighbourhood divisions at two granularities, across
 * several periods. We split them onto two place types:
 *   - 'district'      → wijken  (the coarse division: the 1600 wards + present-day CBS WK units)
 *   - 'neighbourhood' → buurten (the fine division: the 1850/1909 buurten + present-day CBS BU units)
 *
 * Granularity is read from the CBS code (`dc:identifier` WK… / BU…) for present-day
 * units, and from the begin year (1600 = wijk, 1850/1909 = buurt) for the historical
 * ones — every subject carries exactly one of the two, so the split is total.
 *
 * Each place's era is persisted as place_geometry.since/until. Historical units use their
 * own TTL begin/end years (1600 wijken [1600,1850), 1850 buurten [1850,1909), 1909
 * buurten [1909,1921)). Present-day CBS units carry no dates, so each CBS layer is
 * extended back to where its predecessor ends — CBS buurten from 1921, CBS wijken from
 * 1850 — with an open end, leaving NO gap: the buurt timeline is contiguous 1850→now and
 * the wijk timeline 1600→now. Feature ingestion uses these windows to pick the era a
 * feature's date falls in. Distinct eras have distinct URIs, so they coexist as rows.
 *
 * Usage: bun run db:ingest -s neighbourhoods-and-districts -f <path-to-adamlinkbuurten.ttl>
 */
import { readFileSync } from 'fs';
import { Parser } from 'n3';
import { insertPlaces } from '../helpers/helpers';

type DistrictType = 'district' | 'neighbourhood';

// Present-day CBS units carry no dates in the TTL. To leave NO temporal gap, each CBS
// layer is extended back to where its historical predecessor ends, with an open end:
//   - CBS buurten from 1921 (right after the 1909 buurten)  → buurt timeline 1850→now
//   - CBS wijken  from 1850 (right after the 1600 wijken)   → wijk  timeline 1600→now
// This means a mid-20th-century feature lands in present-day CBS boundaries — pragmatic
// gap-filling, to revisit with the PM. Adjust these to change the cutoffs.
const CBS_BUURT_VALID_SINCE = '1921-01-01';
const CBS_WIJK_VALID_SINCE = '1850-01-01';

interface District {
  uri: string;
  label: string;
  wkt: string;
  type: DistrictType;
  since: string;
  until: string | null;
}

/**
 * Classify a district subject as wijk ('district') or buurt ('neighbourhood').
 * Present-day units are tagged by their CBS code prefix (WK = wijk, BU = buurt);
 * historical ones by their begin year (1600 = wijk, 1850/1909 = buurt). Returns
 * null for anything matching neither — e.g. an entry with no CBS code and a
 * begin year outside the three historical systems — which is then skipped.
 */
function classify(cbsCode: string | null, beginYear: number | null): DistrictType | null {
  if (cbsCode) {
    if (cbsCode.startsWith('WK')) return 'district';
    if (cbsCode.startsWith('BU')) return 'neighbourhood';
    return null;
  }
  if (beginYear === 1600) return 'district';                            // wijken
  if (beginYear === 1850 || beginYear === 1909) return 'neighbourhood'; // buurten
  return null;
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
  const cbsCodes = new Map<string, string>();

  for (const q of quads) {
    const pred = q.predicate.value;
    const subj = q.subject.value;
    const obj = q.object.value;
    const isDistrict = subj.includes('/geo/district/');

    if (pred.endsWith('prefLabel') && isDistrict) {
      labels.set(subj, obj);
    } else if (pred.endsWith('hasGeometry')) {
      hasGeometry.set(subj, obj);
    } else if (pred.endsWith('asWKT')) {
      blankToWkt.set(subj, obj);
    } else if (pred.endsWith('hasEarliestBeginTimeStamp') && isDistrict) {
      beginYears.set(subj, parseInt(obj));
    } else if (pred.endsWith('hasEarliestEndTimeStamp') && isDistrict) {
      endYears.set(subj, parseInt(obj));
    } else if (pred.endsWith('identifier') && isDistrict) {
      cbsCodes.set(subj, obj); // CBS code, e.g. "WK036331" / "BU03633100"
    }
  }

  const districts: District[] = [];
  let skipped = 0;

  for (const [uri, blankNode] of hasGeometry) {
    if (!uri.includes('/geo/district/')) continue;
    const wkt = blankToWkt.get(blankNode);
    const label = labels.get(uri);
    if (!wkt || !label) continue;

    const cbs = cbsCodes.get(uri) ?? null;
    const begin = beginYears.get(uri) ?? null;
    const type = classify(cbs, begin);
    if (!type) {
      skipped++;
      continue;
    }

    // Present-day (CBS) → open-ended window from the vintage year; historical units →
    // their own TTL begin/end (e.g. an 1850 buurt → since 1850, until 1909).
    const end = endYears.get(uri) ?? null;
    const since = cbs
      ? (type === 'district' ? CBS_WIJK_VALID_SINCE : CBS_BUURT_VALID_SINCE)
      : `${begin}-01-01`;
    const until = cbs ? null : (end ? `${end}-01-01` : null);

    districts.push({ uri, label, wkt, type, since, until });
  }

  const wijken = districts.filter(d => d.type === 'district').length;
  const buurten = districts.length - wijken;
  console.log(`Resolved ${districts.length} places: ${wijken} districts (wijken), ${buurten} neighbourhoods (buurten)${skipped ? `, ${skipped} skipped` : ''}`);

  const inserted = await insertPlaces(
    districts.map(d => ({ id: d.uri, type: d.type, label: d.label, source: 'adamlink', url: d.uri, wkt: d.wkt, since: d.since, until: d.until })),
    { sourceSrid: 4326, onConflict: 'replaceAll' }
  );

  console.log(`\nDone: ${inserted} district + neighbourhood places`);
}
