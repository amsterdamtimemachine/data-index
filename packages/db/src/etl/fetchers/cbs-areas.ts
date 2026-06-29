import type { Feature, Geometry } from 'geojson';
import { PdokFetcher, PlaceRecord, fesEq } from './pdok-fetcher';

type CbsProps = {
  gemeentecode: string;
  water: string;
  buurtcode?: string;
  buurtnaam?: string;
  wijkcode?: string;
  wijknaam?: string;
};

export class CbsAreasFetcher extends PdokFetcher<CbsProps> {
  protected service = 'https://service.pdok.nl/cbs/wijkenbuurten/2023/wfs/v1_0';
  protected source = 'cbs';
  protected layers = ['wijkenbuurten:buurten', 'wijkenbuurten:wijken'];

  protected gemeenteFilter(code: string) {
    return fesEq('gemeentecode', code);
  }

  protected keep(props: CbsProps) {
    return String(props.water).toUpperCase() !== 'JA';
  }

  protected toPlace(feature: Feature<Geometry, CbsProps>, layer: string): PlaceRecord {
    const p = feature.properties;
    const isBuurt = layer.endsWith('buurten');
    const code = (isBuurt ? p.buurtcode : p.wijkcode)!;
    const lookup = isBuurt ? 'wbk-buurt' : 'wbk-wijk';
    return {
      id: `cbs-${code}`,
      type: isBuurt ? 'neighbourhood' : 'district',
      name: (isBuurt ? p.buurtnaam : p.wijknaam)!,
      source: 'cbs',
      url: `https://api.pdok.nl/bzk/locatieserver/search/v3_1/lookup?id=${lookup}-${code}`,
      geometry: feature.geometry,
    };
  }
}

export const run = (outPath: string) => new CbsAreasFetcher().run(outPath);
