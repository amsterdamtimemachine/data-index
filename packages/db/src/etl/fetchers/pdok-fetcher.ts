import { writeFileSync } from 'fs';
import type { Feature, FeatureCollection, Geometry, GeoJsonProperties } from 'geojson';
import type { PlaceType, PlaceSource } from '@atm/shared';
import { type Gemeente } from './config';
import { getJson } from '../util/http';
import { jsonlWriter } from '../util/jsonl';

interface PlaceRecord {
  id: string;
  type: PlaceType;
  name: string;
  source: PlaceSource;
  url: string | null;
  // the BAG building (pand) an address stands in; addresses only
  buildingId?: string | null;
  geometry: Geometry;
}

export type PlaceDraft = Omit<PlaceRecord, 'source'>;
type OutProps = Omit<PlaceRecord, 'geometry'>;
type OutFeature = Feature<Geometry, OutProps>;

const PAGE = 1000;
const FES = 'http://www.opengis.net/fes/2.0';

export const fesEq = (field: string, value: string) =>
  `<fes:Filter xmlns:fes="${FES}"><fes:PropertyIsEqualTo><fes:ValueReference>${field}</fes:ValueReference><fes:Literal>${value}</fes:Literal></fes:PropertyIsEqualTo></fes:Filter>`;

interface Writer { write(f: OutFeature): void; close(): Promise<void>; }

function geojsonWriter(path: string): Writer {
  const features: OutFeature[] = [];
  return {
    write: f => features.push(f),
    close: async () => writeFileSync(path, JSON.stringify({ type: 'FeatureCollection', features })),
  };
}

const toFeature = (p: PlaceRecord): OutFeature => ({
  type: 'Feature',
  geometry: p.geometry,
  properties: { id: p.id, type: p.type, name: p.name, source: p.source, url: p.url, buildingId: p.buildingId ?? null },
});

export abstract class PdokFetcher<P = GeoJsonProperties> {
  protected abstract source: PlaceSource;
  protected abstract layers: string[];
  protected ndjson = false;

  protected abstract gemeenten(): readonly Gemeente[];
  protected abstract service(g: Gemeente): string;
  protected abstract gemeenteFilter(g: Gemeente): string;
  protected abstract keep(props: P): boolean;
  protected abstract toPlace(feature: Feature<Geometry, P>, layer: string): PlaceDraft;

  protected async fetchFeatures(service: string, layer: string, params: string): Promise<Feature<Geometry, P>[]> {
    const url = `${service}?service=WFS&version=2.0.0&request=GetFeature&typeName=${layer}`
      + `&outputFormat=application/json&srsName=EPSG:28992&${params}`;
    return (await getJson<FeatureCollection<Geometry, P>>(url)).features ?? [];
  }

  protected async *page(service: string, layer: string, filter: string): AsyncGenerator<Feature<Geometry, P>> {
    for (let start = 0; ; start += PAGE) {
      const features = await this.fetchFeatures(service, layer,
        `count=${PAGE}&startIndex=${start}&filter=${encodeURIComponent(filter)}`);
      yield* features;
      if (features.length < PAGE) break;
    }
  }

  // One place per kept feature. Override to aggregate (e.g. NWB merges a street's
  // many segments into a single place).
  protected async *places(g: Gemeente): AsyncGenerator<PlaceDraft> {
    for (const layer of this.layers) {
      for await (const feature of this.page(this.service(g), layer, this.gemeenteFilter(g))) {
        if (!this.keep(feature.properties)) continue;
        yield this.toPlace(feature, layer);
      }
    }
  }

  async run(outPath: string) {
    const writer: Writer = this.ndjson ? jsonlWriter<OutFeature>(outPath) : geojsonWriter(outPath);
    let written = 0;
    for (const g of this.gemeenten()) {
      for await (const draft of this.places(g)) {
        writer.write(toFeature({ ...draft, source: this.source }));
        written++;
      }
    }
    await writer.close();
    console.log(`${this.source}: wrote ${written} places → ${outPath}`);
  }
}
