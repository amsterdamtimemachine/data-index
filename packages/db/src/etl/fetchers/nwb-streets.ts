import { readFileSync } from 'fs';
import type { Feature, Geometry, Position } from 'geojson';
import { PdokFetcher, type PlaceRecord, fesEq } from './pdok-fetcher';
import { type Gemeente } from './config';

type NwbProps = {
  sttNaam?: string;
  gmeId?: number;
  bagOrl?: string;
  bstCode?: string;
};

const SERVICE = 'https://service.pdok.nl/rws/nwbwegen/wfs/v1_0';

// NWB baansubsoort (bstCode) — the kind of road segment a wegvak is.
// Ref: https://docs.ndw.nu/en/handleidingen/nwb/nwb-basisstructuur/baansubsoort/
//   Streets : RB carriageway, HR main carriageway, ERF woonerf
//   Footpath: VP footpath (kept only for pedestrian-only openbareruimte; see places())
//   Dropped : FP bike path, BUS bus lane, PP local parking, PKB fuel parking,
//             AFR exit ramp, OPR entrance ramp, NRB roundabout, WIS reversible lane,
//             TN intermediate lane, PST slip triangle,
//             VBD/VBK/VBR/VBS/VBW connectors (direct/shortcut/weaving/semi-direct/other)
const STREET_CODES = new Set(['RB', 'ERF', 'HR']);
const FOOTPATH = 'VP';

// Amsterdam (gmeId 363, incl. annexed Weesp) is the only territory Adamlink covers
// for streets. There a no-bagOrl street can't be crosswalked and is almost always a
// bridge/lock segment or a duplicate Adamlink already has, so we require a bagOrl.
const ADAMLINK_GMEID = 363;

function pushLines(into: Position[][], geom: Geometry): void {
  if (geom.type === 'LineString') into.push(geom.coordinates);
  else if (geom.type === 'MultiLineString') for (const line of geom.coordinates) into.push(line);
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// BAG openbareruimte ids (16-digit) Adamlink straten already covers, from its
// owl:sameAs links (<…/openbare-ruimte/<id>>). NWB streets sharing one are duplicates.
function adamlinkBagOrls(ttlPath: string): Set<string> {
  const ttl = readFileSync(ttlPath, 'utf8');
  return new Set([...ttl.matchAll(/openbare-ruimte\/(\d{16})/g)].map(m => m[1]));
}

export class NwbStreetsFetcher extends PdokFetcher<NwbProps> {
  protected source = 'nwb';
  protected layers = ['nwbwegen:wegvakken'];
  private readonly exclude: Set<string>;
  private dupBagOrl = 0;
  private noCrosswalk = 0;

  // dedupTtl: Adamlink straten TTL. Streets whose bagOrl it already covers are
  // skipped, so NWB tops up Amsterdam without duplicating Adamlink.
  constructor(dedupTtl?: string) {
    super();
    this.exclude = dedupTtl ? adamlinkBagOrls(dedupTtl) : new Set();
  }

  protected service() { return SERVICE; }
  protected gemeenteFilter(g: Gemeente) { return fesEq('gmeId', String(parseInt(g.code.slice(2), 10))); }
  protected keep(props: NwbProps) {
    return !!props.sttNaam && (STREET_CODES.has(props.bstCode ?? '') || props.bstCode === FOOTPATH);
  }

  // NWB returns one feature per road segment; a street is many segments sharing a
  // bagOrl (BAG openbareruimte). Merge them into one MultiLineString per street,
  // preferring carriageway geometry and falling back to footpath for pedestrian-only ways.
  protected async *places(g: Gemeente): AsyncGenerator<PlaceRecord> {
    const groups = new Map<string, { props: NwbProps; street: Position[][]; foot: Position[][] }>();
    for await (const seg of this.page(this.service(), this.layers[0], this.gemeenteFilter(g))) {
      if (!this.keep(seg.properties)) continue;
      const p = seg.properties;
      const key = p.bagOrl?.trim() || `${p.gmeId}|${p.sttNaam}`;
      let grp = groups.get(key);
      if (!grp) { grp = { props: p, street: [], foot: [] }; groups.set(key, grp); }
      pushLines(STREET_CODES.has(p.bstCode ?? '') ? grp.street : grp.foot, seg.geometry);
    }
    const dedup = this.exclude.size > 0;
    for (const { props, street, foot } of groups.values()) {
      const bagOrl = props.bagOrl?.trim();
      if (bagOrl && this.exclude.has(bagOrl)) { this.dupBagOrl++; continue; }
      if (dedup && !bagOrl && props.gmeId === ADAMLINK_GMEID) { this.noCrosswalk++; continue; }
      const lines = street.length ? street : foot;
      yield this.toPlace({ type: 'Feature', properties: props, geometry: { type: 'MultiLineString', coordinates: lines } });
    }
  }

  async run(outPath: string) {
    await super.run(outPath);
    if (this.exclude.size) {
      console.log(`nwb: skipped ${this.dupBagOrl} Adamlink duplicates + ${this.noCrosswalk} no-bagOrl Amsterdam streets (bridges/uncrosswalkable)`);
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

export const run = (outPath: string, opts?: { excludeAdamlink?: string }) =>
  new NwbStreetsFetcher(opts?.excludeAdamlink).run(outPath);
