import type { Feature, Geometry, Position } from 'geojson';
import { PdokFetcher, type PlaceRecord, fesEq } from './pdok-fetcher';
import { MUNICIPALITIES, type Gemeente } from './config';

type NwbProps = {
  sttNaam?: string;
  gmeId?: number;
  bagOrl?: string;
};

const SERVICE = 'https://service.pdok.nl/rws/nwbwegen/wfs/v1_0';

function pushLines(into: Position[][], geom: Geometry): void {
  if (geom.type === 'LineString') into.push(geom.coordinates);
  else if (geom.type === 'MultiLineString') for (const line of geom.coordinates) into.push(line);
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export class NwbStreetsFetcher extends PdokFetcher<NwbProps> {
  protected source = 'nwb';
  protected layers = ['nwbwegen:wegvakken'];

  // Amsterdam (GM0363, incl. annexed Weesp) streets come from Adamlink.
  protected gemeenten() { return MUNICIPALITIES.filter(m => m.code !== 'GM0363'); }
  protected service() { return SERVICE; }
  protected gemeenteFilter(g: Gemeente) { return fesEq('gmeId', String(parseInt(g.code.slice(2), 10))); }
  protected keep(props: NwbProps) { return !!props.sttNaam; }

  // NWB returns one feature per road segment; a street is many segments sharing a
  // bagOrl (BAG openbareruimte). Merge them into one MultiLineString per street.
  protected async *places(g: Gemeente): AsyncGenerator<PlaceRecord> {
    const groups = new Map<string, { props: NwbProps; lines: Position[][] }>();
    for await (const seg of this.page(this.service(), this.layers[0], this.gemeenteFilter(g))) {
      if (!this.keep(seg.properties)) continue;
      const p = seg.properties;
      const key = p.bagOrl?.trim() || `${p.gmeId}|${p.sttNaam}`;
      let grp = groups.get(key);
      if (!grp) { grp = { props: p, lines: [] }; groups.set(key, grp); }
      pushLines(grp.lines, seg.geometry);
    }
    for (const { props, lines } of groups.values()) {
      yield this.toPlace({ type: 'Feature', properties: props, geometry: { type: 'MultiLineString', coordinates: lines } });
    }
  }

  protected toPlace(feature: Feature<Geometry, NwbProps>): PlaceRecord {
    const p = feature.properties;
    const bagOrl = p.bagOrl?.trim() || null;
    return {
      id: bagOrl ? `nwb-${bagOrl}` : `nwb-${p.gmeId}-${slug(p.sttNaam!)}`,
      type: 'street',
      name: p.sttNaam!,
      source: 'nwb',
      url: bagOrl ? `https://bagviewer.kadaster.nl/lvbag/bag-viewer/#?searchQuery=${bagOrl}` : null,
      geometry: feature.geometry,
    };
  }
}

export const run = (outPath: string) => new NwbStreetsFetcher().run(outPath);
