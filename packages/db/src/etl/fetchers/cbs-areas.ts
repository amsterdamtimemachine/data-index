import type { Feature, Geometry } from 'geojson';
import { PdokFetcher, type PlaceRecord, fesEq } from './pdok-fetcher';
import { MUNICIPALITIES, type Gemeente } from './config';

type CbsProps = {
  gemeentecode: string;
  water: string;
  buurtcode?: string;
  buurtnaam?: string;
  wijkcode?: string;
  wijknaam?: string;
};

// Amsterdam (GM0363) areas come from Adamlink. Weesp was annexed by Amsterdam in
// 2022, so its standalone areas live in the last vintage that still has GM0457.
const AREA_GEMEENTEN: Gemeente[] = [
  ...MUNICIPALITIES.filter(m => m.code !== 'GM0363').map(m => ({ name: m.name, code: m.code, year: '2023' })),
  { name: 'Weesp', code: 'GM0457', year: '2022' },
];

export class CbsAreasFetcher extends PdokFetcher<CbsProps> {
  protected source = 'cbs';
  protected layers = ['wijkenbuurten:buurten', 'wijkenbuurten:wijken'];

  protected gemeenten() { return AREA_GEMEENTEN; }
  protected service(g: Gemeente) { return `https://service.pdok.nl/cbs/wijkenbuurten/${g.year}/wfs/v1_0`; }
  protected gemeenteFilter(g: Gemeente) { return fesEq('gemeentecode', g.code); }
  protected keep(props: CbsProps) { return String(props.water).toUpperCase() !== 'JA'; }

  protected toPlace(feature: Feature<Geometry, CbsProps>, layer: string): PlaceRecord {
    const p = feature.properties;
    const isBuurt = layer.endsWith('buurten');
    const code = (isBuurt ? p.buurtcode : p.wijkcode)!;
    return {
      id: `cbs-${code}`,
      type: isBuurt ? 'neighbourhood' : 'district',
      name: (isBuurt ? p.buurtnaam : p.wijknaam)!,
      source: 'cbs',
      url: null,
      geometry: feature.geometry,
    };
  }
}

export const run = (outPath: string) => new CbsAreasFetcher().run(outPath);
