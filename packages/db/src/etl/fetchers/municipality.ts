/**
 * The municipality boundary from PDOK's administrative areas (Kadaster, bestuurlijke
 * gebieden): one polygon per municipality in ACTIVE_SCOPE, written as the service
 * returns it (a GeoJSON FeatureCollection in RD/28992). The scope file for sources
 * whose data reaches beyond the territory, such as the Adamlink buildings. Weesp,
 * annexed in 2022, is part of Amsterdam's polygon in the current boundaries.
 *
 * Usage: bun run db:fetch -s municipality -o <data-dir>/municipality.geojson
 */
import { writeFileSync } from 'fs';
import { ACTIVE_SCOPE } from './config';

const SERVICE = 'https://service.pdok.nl/kadaster/bestuurlijkegebieden/wfs/v1_0';
const FES = 'http://www.opengis.net/fes/2.0';

export async function run(outPath: string) {
  const codes = ACTIVE_SCOPE.map((g) => `<fes:PropertyIsEqualTo><fes:ValueReference>identificatie</fes:ValueReference><fes:Literal>${g.code}</fes:Literal></fes:PropertyIsEqualTo>`);
  const filter = `<fes:Filter xmlns:fes="${FES}"><fes:Or>${codes.join('')}</fes:Or></fes:Filter>`;
  const url = `${SERVICE}?service=WFS&version=2.0.0&request=GetFeature&typeNames=bestuurlijkegebieden:Gemeentegebied`
    + `&outputFormat=application/json&srsName=EPSG:28992&filter=${encodeURIComponent(filter)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`PDOK ${res.status} for ${url}`);
  const collection = await res.json() as { features: { properties: { identificatie: string; naam: string } }[] };
  writeFileSync(outPath, JSON.stringify(collection));
  const found = collection.features.map((f) => `${f.properties.naam} (${f.properties.identificatie})`);
  console.log(`Wrote ${collection.features.length} municipality boundaries to ${outPath}: ${found.join(', ')}`);
}
