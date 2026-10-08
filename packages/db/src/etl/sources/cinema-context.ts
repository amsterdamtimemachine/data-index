/**
 * Import Cinema Context programmes: one programme of one venue on one date as an
 * event, at the venue's address.
 *
 * Reads the JSONL exported from the Cinema Context database dump: one line per
 * programme with its venue, the venue's address as written and its point, the bill
 * in order, and the newspapers it was listed in. A programme is valid with at least
 * one film or act on its bill; an empty bill is skipped. The label is the first
 * item on the bill. A programme with a film is a ScreeningEvent screened at its
 * venue, one with acts only a TheaterEvent performed there.
 *
 * The place is the venue's address, matched by name against the dated address names
 * (Adamlink before 1943, BAG after, as for any era match); an address written as a
 * range or a description matches nothing and falls back to the point. Dates keep the
 * source's precision: a day, a month for "1907-05-xx", a year for "1907".
 *
 * Usage: bun run db:ingest -s cinema-context -f <path-to-cinema-context.jsonl>
 */
import { Draft, Ingestor } from '../ingest/ingestor';
import { ProgrammeEntityFactory, programmeBill, type ProgrammeItem } from '../ingest/entity-factory';
import { ExtractionArgs, PlaceExtractionMethod } from '../places/place-index';
import { RecordType } from '@atm/shared';

type CinemaContextRecord = {
  perm_id: string | null;
  // the programme's page at the source, present with a permanent id
  url: string | null;
  programme_id: string;
  date: string | null;
  venue: { perm_id: string | null; name: string | null; type: string | null };
  // the venue's address as the source writes it
  address: string | null;
  geom_wkt: string;
  items: ProgrammeItem[];
  sources: string[];
};

const SCREENED_AT = { id: 'screenedAt', label: 'Screened at', dated: true };
const PERFORMED_AT = { id: 'performedAt', label: 'Performed at', dated: true };

/** The first item on the bill, film or act, as the source words it. */
function firstOnBill(items: ProgrammeItem[]): string | undefined {
  for (const item of items) {
    if (item.title) return item.title;
    if (item.live) return item.live;
  }
  return undefined;
}

function lastDayOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** The programme's period at the source's precision; null when unparseable. */
export function parseProgrammeDate(raw: string | null): { startDate: string; endDate: string } | null {
  if (!raw) return null;
  const day = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (day) {
    const [, y, m, d] = day;
    const month = parseInt(m, 10);
    if (month < 1 || month > 12 || parseInt(d, 10) < 1 || parseInt(d, 10) > lastDayOfMonth(parseInt(y, 10), month)) return null;
    return { startDate: raw, endDate: raw };
  }
  const month = raw.match(/^(\d{4})-(\d{2})(?:-xx)?$/);
  if (month) {
    const [, y, m] = month;
    const mm = parseInt(m, 10);
    if (mm < 1 || mm > 12) return null;
    const last = String(lastDayOfMonth(parseInt(y, 10), mm)).padStart(2, '0');
    return { startDate: `${y}-${m}-01`, endDate: `${y}-${m}-${last}` };
  }
  const year = raw.match(/^(\d{4})(?:-xx-xx)?$/);
  if (year) {
    const y = year[1];
    return { startDate: `${y}-01-01`, endDate: `${y}-12-31` };
  }
  return null;
}

export class CinemaContextIngestor extends Ingestor<CinemaContextRecord> {
  protected ORG_ID = 'cinema-context';
  protected ORG_LABEL = 'Cinema Context';
  protected ORG_URL = 'https://cinemacontext.nl';

  protected DATASET_ID = 'cinema-context';
  protected DATASET_LABEL = 'Cinema Context';
  protected DATASET_URL = 'https://cinemacontext.nl';

  protected RECORD_TYPE: RecordType = 'event';
  protected RELATION_ID = SCREENED_AT.id;
  protected RELATION_LABEL = SCREENED_AT.label;

  protected PLACE_EXTRACTION_METHODS: ExtractionArgs<CinemaContextRecord> = [
    { method: PlaceExtractionMethod.NAME, column: 'address' },
    { method: PlaceExtractionMethod.WKT, column: 'geom_wkt' },
  ];

  protected entityFactory() {
    return new ProgrammeEntityFactory();
  }

  protected relations() {
    return [SCREENED_AT, PERFORMED_AT];
  }

  // screened at with a film on the bill, performed at with acts only
  protected relationFor(source: CinemaContextRecord): string {
    if (programmeBill(source.items ?? []).films.length > 0) {
      return SCREENED_AT.id;
    }
    return PERFORMED_AT.id;
  }

  protected transform(source: CinemaContextRecord): Draft | undefined {
    const dates = parseProgrammeDate(source.date);
    const first = firstOnBill(source.items ?? []);
    if (!dates || !first) {
      return undefined;
    }
    return {
      // the permanent id where the source has one; the internal id keeps the rest stable
      id: source.perm_id ?? `programme-${source.programme_id}`,
      url: source.url ?? '',
      label: first,
      description: '',
      startDate: dates.startDate,
      endDate: dates.endDate,
    };
  }
}

const ingestor = new CinemaContextIngestor();

export async function ingest(filePath: string) {
  await ingestor.ingest(filePath);
}
