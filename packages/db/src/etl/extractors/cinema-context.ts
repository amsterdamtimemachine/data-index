/**
 * Extract Cinema Context programmes from the database dump (pg_dump, plain SQL) into
 * the JSONL the cinema-context ingest reads.
 *
 * One line per programme inside the territory: its permanent id, date, venue with its
 * kind, the venue's address as written and its point, and the bill in its order
 * (films and live acts). Values are copied from the dump as they are; the ingest
 * decides what makes a programme valid. A programme whose venue has no address or no
 * coordinate is left out, since its point is what places it in the territory.
 *
 * Usage: bun run db:extract -s cinema-context -i <dump.sql> -o <data-dir>/cinema-context.jsonl -m <data-dir>/municipality.geojson
 */
import { createReadStream } from 'fs';
import { createInterface } from 'readline';
import type { CinemaContextRecord } from '../sources/cinema-context';
import type { SourceItem } from '../ingest/entity-factory';
import { jsonlWriter } from '../util/jsonl';
import { loadScope } from '../util/scope';
import { pointWkt } from '../util/wkt';

// the site resolves permanent ids of programmes (V…), films (F…) and venues (B…) at this path
const RECORD_URL = 'https://cinemacontext.nl/id/';

// the tables the extract joins, and the columns it reads from each
const TABLES = {
  editor_address: ['id', 'street_name', 'geodata'],
  editor_venue: ['id', 'address_id', 'perm_id', 'name', 'venue_type'],
  editor_programme: ['id', 'programme_id', 'programme_date', 'perm_id', 'venue_reference_id'],
  editor_programmeitem: ['id', 'order', 'live_performance', 'film_reference_id', 'film_variation_reference_id', 'programme_reference_id'],
  editor_film: ['id', 'title', 'perm_id', 'film_year', 'country', 'film_director', 'production_company'],
  editor_filmtitlevariation: ['id', 'title', 'film_reference_id'],
} as const;

type TableName = keyof typeof TABLES;
type Row = Record<string, string | null>;

// a field of COPY's text format: \N is null, a backslash escapes the next character
function copyField(field: string): string | null {
  if (field === '\\N') {
    return null;
  }
  return field.replace(/\\(?:([0-7]{1,3})|x([0-9a-fA-F]{1,2})|(.))/g, (_, octal, hex, char) => {
    if (octal) return String.fromCharCode(parseInt(octal, 8));
    if (hex) return String.fromCharCode(parseInt(hex, 16));
    const named: Record<string, string> = { b: '\b', f: '\f', n: '\n', r: '\r', t: '\t', v: '\v' };
    return named[char] ?? char;
  });
}

/** The rows of the wanted tables, each with the wanted columns only, in the dump's order. */
async function readTables(dumpPath: string): Promise<Record<TableName, Row[]>> {
  const tables = Object.fromEntries(Object.keys(TABLES).map((t) => [t, [] as Row[]])) as Record<TableName, Row[]>;
  let current: TableName | null = null;
  let picks: [string, number][] = [];
  const lines = createInterface({ input: createReadStream(dumpPath, 'utf8'), crlfDelay: Infinity });
  for await (const line of lines) {
    if (current === null) {
      const m = line.match(/^COPY public\.(\w+) \((.*)\) FROM stdin;/);
      if (m && m[1] in TABLES) {
        current = m[1] as TableName;
        const columns = m[2].split(',').map((c) => c.trim().replace(/^"|"$/g, ''));
        picks = TABLES[current].map((name) => [name, columns.indexOf(name)]);
        const missing = picks.filter(([, i]) => i < 0).map(([name]) => name);
        if (missing.length) {
          throw new Error(`${current} in ${dumpPath} has no column ${missing.join(', ')}`);
        }
      }
      continue;
    }
    if (line.startsWith('\\.')) {
      current = null;
      continue;
    }
    const fields = line.split('\t');
    tables[current].push(Object.fromEntries(picks.map(([name, i]) => [name, copyField(fields[i])])));
  }
  for (const [name, rows] of Object.entries(tables)) {
    if (rows.length === 0) {
      throw new Error(`${dumpPath} holds no rows of ${name}`);
    }
  }
  return tables;
}

// a value as the index takes it: trimmed, and an empty one is none
function val(v: string | null | undefined): string | null {
  const trimmed = v?.trim();
  if (!trimmed) {
    return null;
  }
  return trimmed;
}

// the address's coordinate, which the source writes "lat, lon"
function lonLat(geodata: string | null): [number, number] | null {
  const m = val(geodata)?.match(/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/);
  if (!m) {
    return null;
  }
  return [parseFloat(m[2]), parseFloat(m[1])];
}

// the bill's own order, numeric, with the row id as a stable tiebreak
function billOrder(a: Row, b: Row): number {
  const order = (item: Row) => {
    const o = val(item.order);
    if (o && /^-?\d+$/.test(o)) {
      return parseInt(o, 10);
    }
    return 0;
  };
  return order(a) - order(b) || parseInt(a.id!, 10) - parseInt(b.id!, 10);
}

function recordUrl(permId: string | null): string | null {
  if (!permId) {
    return null;
  }
  return RECORD_URL + permId;
}

function byId(rows: Row[]): Map<string, Row> {
  return new Map(rows.map((r) => [r.id!, r]));
}

/** An item of the bill: its title as the bill lists it, the film's details, and a live act's wording. */
function billItem(item: Row, films: Map<string, Row>, variations: Map<string, Row>): SourceItem {
  const variation = variations.get(item.film_variation_reference_id ?? '');
  let film = films.get(item.film_reference_id ?? '');
  if (variation && !film) {
    film = films.get(variation.film_reference_id ?? '');
  }
  let title: string | null = null;
  if (variation) {
    title = val(variation.title);
  } else if (film) {
    title = val(film.title);
  }
  const entry: SourceItem = {};
  if (title) {
    entry.title = title;
  }
  if (film) {
    const details: [string, keyof SourceItem][] = [
      ['perm_id', 'film_perm_id'], ['film_year', 'year'], ['country', 'country'],
      ['film_director', 'director'], ['production_company', 'production_company'],
    ];
    for (const [column, key] of details) {
      const v = val(film[column]);
      if (v) {
        entry[key] = v;
      }
    }
    if (entry.film_perm_id) {
      entry.url = RECORD_URL + entry.film_perm_id;
    }
    const filmTitle = val(film.title);
    if (variation && filmTitle && filmTitle !== title) {
      entry.original_title = filmTitle;
    }
  }
  const live = val(item.live_performance);
  if (live) {
    entry.live = live;
  }
  return entry;
}

export async function run(dumpPath: string, outPath: string, opts: { municipality?: string } = {}) {
  if (!opts.municipality) {
    throw new Error('the cinema-context extract keeps the territory: -m <data-dir>/municipality.geojson (from db:fetch -s municipality)');
  }
  const inScope = loadScope(opts.municipality);

  console.log(`Reading ${dumpPath}...`);
  const t = await readTables(dumpPath);
  const addresses = byId(t.editor_address);
  const venues = byId(t.editor_venue);
  const films = byId(t.editor_film);
  const variations = byId(t.editor_filmtitlevariation);
  const bills = new Map<string, Row[]>();
  for (const item of t.editor_programmeitem) {
    const programme = item.programme_reference_id ?? '';
    if (!bills.has(programme)) {
      bills.set(programme, []);
    }
    bills.get(programme)!.push(item);
  }

  const out = jsonlWriter<CinemaContextRecord>(outPath);
  for (const p of t.editor_programme) {
    const venue = venues.get(p.venue_reference_id ?? '');
    const address = addresses.get(venue?.address_id ?? '');
    if (!venue || !address) {
      out.skip('without a venue address');
      continue;
    }
    const point = lonLat(address.geodata);
    if (!point) {
      out.skip('without coordinates');
      continue;
    }
    if (!inScope(...point)) {
      out.skip('outside the territory');
      continue;
    }
    const items = [...(bills.get(p.id!) ?? [])].sort(billOrder)
      .map((item) => billItem(item, films, variations))
      .filter((entry) => Object.keys(entry).length > 0);
    const permId = val(p.perm_id);
    const venuePermId = val(venue.perm_id);
    out.write({
      perm_id: permId,
      url: recordUrl(permId),
      programme_id: val(p.programme_id) ?? p.id!,
      date: val(p.programme_date),
      venue: {
        perm_id: venuePermId,
        url: recordUrl(venuePermId),
        name: val(venue.name),
        type: val(venue.venue_type),
      },
      address: val(address.street_name),
      geom_wkt: pointWkt(...point),
      items,
    });
  }
  await out.close();
  console.log(`cinema-context: ${out.summary()}`);
}
