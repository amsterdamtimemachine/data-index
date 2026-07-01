import { writeFileSync, createWriteStream } from 'fs';
import type { Feature, FeatureCollection, Geometry, GeoJsonProperties } from 'geojson';
import type { PlaceType } from '@atm/shared';
import { MUNICIPALITIES, type Gemeente } from './config';

export interface PlaceRecord {
  id: string;
  type: PlaceType;
  name: string;
  source: string;
  url: string | null;
  geometry: Geometry;
}

type OutProps = { id: string; type: PlaceType; name: string; source: string; url: string | null };
type OutFeature = Feature<Geometry, OutProps>;

const PAGE = 1000;
const FES = 'http://www.opengis.net/fes/2.0';

export const fesEq = (field: string, value: string) =>
  `<fes:Filter xmlns:fes="${FES}"><fes:PropertyIsEqualTo><fes:ValueReference>${field}</fes:ValueReference><fes:Literal>${value}</fes:Literal></fes:PropertyIsEqualTo></fes:Filter>`;

export const fesLike = (field: string, value: string) =>
  `<fes:Filter xmlns:fes="${FES}"><fes:PropertyIsLike wildCard="*" singleChar="?" escapeChar="\\"><fes:ValueReference>${field}</fes:ValueReference><fes:Literal>${value}</fes:Literal></fes:PropertyIsLike></fes:Filter>`;

async function getJson<T>(url: string, retries = 2): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'atm-fetcher/1.0' }, signal: AbortSignal.timeout(30000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      if (attempt >= retries) throw err;
    }
  }
}

interface Writer { write(f: OutFeature): void; close(): Promise<void>; }

function geojsonWriter(path: string): Writer {
  const features: OutFeature[] = [];
  return {
    write: f => features.push(f),
    close: async () => writeFileSync(path, JSON.stringify({ type: 'FeatureCollection', features })),
  };
}

function ndjsonWriter(path: string): Writer {
  const stream = createWriteStream(path);
  return {
    write: f => stream.write(JSON.stringify(f) + '\n'),
    close: () => new Promise<void>((resolve, reject) => { stream.on('error', reject); stream.end(() => resolve()); }),
  };
}

const toFeature = (p: PlaceRecord): OutFeature => ({
  type: 'Feature',
  geometry: p.geometry,
  properties: { id: p.id, type: p.type, name: p.name, source: p.source, url: p.url },
});

export abstract class PdokFetcher<P = GeoJsonProperties> {
  protected abstract source: string;
  protected abstract layers: string[];
  protected ndjson = false;

  protected gemeenten(): readonly Gemeente[] { return MUNICIPALITIES; }
  protected abstract service(g: Gemeente): string;
  protected abstract gemeenteFilter(g: Gemeente): string;
  protected abstract keep(props: P): boolean;
  protected abstract toPlace(feature: Feature<Geometry, P>, layer: string): PlaceRecord;

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
  protected async *places(g: Gemeente): AsyncGenerator<PlaceRecord> {
    for (const layer of this.layers) {
      for await (const feature of this.page(this.service(g), layer, this.gemeenteFilter(g))) {
        if (!this.keep(feature.properties)) continue;
        yield this.toPlace(feature, layer);
      }
    }
  }

  async run(outPath: string) {
    const writer = this.ndjson ? ndjsonWriter(outPath) : geojsonWriter(outPath);
    let written = 0;
    for (const g of this.gemeenten()) {
      for await (const place of this.places(g)) {
        writer.write(toFeature(place));
        written++;
      }
    }
    await writer.close();
    console.log(`${this.source}: wrote ${written} places → ${outPath}`);
  }
}
