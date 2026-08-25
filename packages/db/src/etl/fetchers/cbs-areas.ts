import type { Feature, Geometry } from 'geojson';
import { PdokFetcher, type PlaceDraft, fesEq } from './pdok-fetcher';
import { WEESP, type Gemeente } from './config';

type CbsProps = {
  gemeentecode: string;
  water: string;
  buurtcode?: string;
  buurtnaam?: string;
  wijkcode?: string;
  wijknaam?: string;
};

// ACTIVE_SCOPE refinement: Weesp only — its areas aren't in Adamlink (Amsterdam's are, incl. the current
// indeling as the until=NULL layer). Weesp was annexed by Amsterdam in 2022, so its standalone
// areas live in the last vintage that still has GM0457. Peripheral parked: add the peripheral
// municipalities @ '2023' to expand.
const AREA_GEMEENTEN: Gemeente[] = [
  { ...WEESP, year: '2022' },
];

export class CbsAreasFetcher extends PdokFetcher<CbsProps> {
  protected source = 'cbs' as const;
  protected layers = ['wijkenbuurten:buurten', 'wijkenbuurten:wijken'];

  protected gemeenten() { return AREA_GEMEENTEN; }
  protected service(g: Gemeente) { return `https://service.pdok.nl/cbs/wijkenbuurten/${g.year}/wfs/v1_0`; }
  protected gemeenteFilter(g: Gemeente) { return fesEq('gemeentecode', g.code); }
  protected keep(props: CbsProps) { return String(props.water).toUpperCase() !== 'JA'; }

  protected toPlace(feature: Feature<Geometry, CbsProps>, layer: string): PlaceDraft {
    const p = feature.properties;
    const isBuurt = layer.endsWith('buurten');
    const code = (isBuurt ? p.buurtcode : p.wijkcode)!;
    return {
      id: `cbs-${code}`,
      type: isBuurt ? 'neighbourhood' : 'district',
      name: (isBuurt ? p.buurtnaam : p.wijknaam)!,
      url: null,
      geometry: feature.geometry,
    };
  }
}

export const run = (outPath: string) => new CbsAreasFetcher().run(outPath);
