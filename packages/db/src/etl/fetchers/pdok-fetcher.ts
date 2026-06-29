import { writeFileSync, createWriteStream } from 'fs';
import type { Feature, FeatureCollection, Geometry, GeoJsonProperties } from 'geojson';
import type { PlaceType } from '@atm/shared';
import { MUNICIPALITIES } from './config';

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
  protected abstract service: string;
  protected abstract source: string;
  protected abstract layers: string[];
  protected ndjson = false;

  protected abstract gemeenteFilter(code: string): string;
  protected abstract keep(props: P): boolean;
  protected abstract toPlace(feature: Feature<Geometry, P>, layer: string): PlaceRecord;

  private async *page(layer: string, filter: string): AsyncGenerator<Feature<Geometry, P>> {
    for (let start = 0; ; start += PAGE) {
      const url = `${this.service}?service=WFS&version=2.0.0&request=GetFeature&typeName=${layer}`
        + `&outputFormat=application/json&srsName=EPSG:28992&count=${PAGE}&startIndex=${start}`
        + `&filter=${encodeURIComponent(filter)}`;
      const features = (await getJson<FeatureCollection<Geometry, P>>(url)).features ?? [];
      yield* features;
      if (features.length < PAGE) break;
    }
  }

  async run(outPath: string) {
    const writer = this.ndjson ? ndjsonWriter(outPath) : geojsonWriter(outPath);
    let written = 0;
    for (const layer of this.layers) {
      for (const { code } of MUNICIPALITIES) {
        for await (const feature of this.page(layer, this.gemeenteFilter(code))) {
          if (!this.keep(feature.properties)) continue;
          writer.write(toFeature(this.toPlace(feature, layer)));
          written++;
        }
      }
    }
    await writer.close();
    console.log(`${this.source}: wrote ${written} places → ${outPath}`);
  }
}
