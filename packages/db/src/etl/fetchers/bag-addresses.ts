import type { Feature, Geometry } from 'geojson';
import { PdokFetcher, type PlaceDraft } from './pdok-fetcher';
import { AMSTERDAM, WEESP, type Gemeente } from './config';

type BagProps = {
  identificatie: string;
  openbare_ruimte?: string;
  huisnummer?: number;
  huisletter?: string;
  toevoeging?: string;
  rdf_seealso?: string;
};

const SERVICE = 'https://service.pdok.nl/lv/bag/wfs/v2_0';
const PAGE = 1000;
const FES = 'http://www.opengis.net/fes/2.0';

const likeIdent = (code: string) => `<fes:PropertyIsLike wildCard="*" singleChar="?" escapeChar="\\"><fes:ValueReference>identificatie</fes:ValueReference><fes:Literal>${code}*</fes:Literal></fes:PropertyIsLike>`;
const gtIdent = (id: string) => `<fes:PropertyIsGreaterThan><fes:ValueReference>identificatie</fes:ValueReference><fes:Literal>${id}</fes:Literal></fes:PropertyIsGreaterThan>`;
const wrap = (inner: string) => `<fes:Filter xmlns:fes="${FES}">${inner}</fes:Filter>`;

function addressLabel(p: BagProps): string {
  const suffix = `${p.huisletter ?? ''}${p.toevoeging ? '-' + p.toevoeging : ''}`;
  return `${p.openbare_ruimte} ${p.huisnummer ?? ''}${suffix}`.trim();
}

// Current addresses (BAG verblijfsobject), all 10 municipalities incl. Amsterdam —
// they coexist with the historical Adamlink LPs (different ids, no dedup). The
// identificatie is 16 digits, first 4 = gemeente code.
export class BagAddressesFetcher extends PdokFetcher<BagProps> {
  protected source = 'bag' as const;
  protected layers = ['bag:verblijfsobject'];
  protected ndjson = true;

  // Task scope: Amsterdam (current addresses) + Weesp (identificatie 0457*, still
  // present post-annexation; not in Adamlink). Peripheral parked — add them here to re-expand.
  protected gemeenten() { return [AMSTERDAM, WEESP]; }
  protected service() { return SERVICE; }
  protected gemeenteFilter(g: Gemeente) { return wrap(likeIdent(g.code.slice(2))); }
  protected keep(props: BagProps) { return !!props.identificatie && !!props.openbare_ruimte; }

  // PDOK's BAG WFS caps startIndex paging, so a large municipality (Amsterdam ~470k)
  // is fetched by keyset pagination: sort by identificatie and page with
  // identificatie > last-seen instead of a growing offset.
  protected async *places(g: Gemeente): AsyncGenerator<PlaceDraft> {
    const code = g.code.slice(2);
    const layer = this.layers[0];
    let cursor: string | null = null;
    for (;;) {
      const filter = cursor
        ? wrap(`<fes:And>${likeIdent(code)}${gtIdent(cursor)}</fes:And>`)
        : this.gemeenteFilter(g);
      const features = await this.fetchFeatures(this.service(), layer,
        `count=${PAGE}&sortBy=identificatie&filter=${encodeURIComponent(filter)}`);
      if (!features.length) break;
      for (const f of features) if (this.keep(f.properties)) yield this.toPlace(f);
      if (features.length < PAGE) break;
      cursor = features[features.length - 1].properties.identificatie;
    }
  }

  protected toPlace(feature: Feature<Geometry, BagProps>): PlaceDraft {
    const p = feature.properties;
    return {
      id: `bag-${p.identificatie}`,
      type: 'address',
      name: addressLabel(p),
      url: p.rdf_seealso ?? null,
      geometry: feature.geometry,
    };
  }
}

export const run = (outPath: string) => new BagAddressesFetcher().run(outPath);
