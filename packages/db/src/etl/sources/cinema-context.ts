/**
 * Import Cinema Context programmes: one weekly programme of one cinema as an event,
 * placed at the cinema's address.
 *
 * Reads the JSONL exported from the Cinema Context database dump (one line per
 * programme with its venue, coordinates, bill and newspaper sources). The venue's
 * point resolves through the WKT cascade (inferByPoint) to the era-appropriate
 * address, so a cinema's programmes land on the Adamlink address before 1943 and the
 * BAG address after it. Links come with the file: the export knows the site. The venue's permanent id is the feature's group key, which
 * keeps a cinema's programmes together across that boundary. The label is the venue's
 * name; the date is the entity's, kept at the source's precision: a full day, a month
 * for "1907-05-xx", a year for "1907", and the app words it. Anything else is skipped.
 *
 * Usage: bun run db:ingest -s cinema-context -f <path-to-cinema-context.jsonl>
 */
import { Draft, Ingestor } from '../ingest/ingestor';
import { ScreeningEventEntityFactory } from '../ingest/entity-factory';
import { ExtractionArgs, PlaceExtractionMethod } from '../places/place-index';
import { RecordType } from '@atm/shared';

type CinemaContextRecord = {
  perm_id: string | null;
  // the programme's page at the source, present with a permanent id
  url: string | null;
  programme_id: string;
  date: string | null;
  programme_title: string | null;
  first_sound: boolean;
  venue: { perm_id: string | null; name: string | null; type: string | null; schema_type: string | null; address: string | null; city: string | null };
  geom_wkt: string;
  items: Array<{ title?: string; film_perm_id?: string; url?: string; year?: string; country?: string; director?: string; production_company?: string; live?: string }>;
  sources: string[];
};

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
  protected RELATION_ID = 'isAbout';
  protected RELATION_LABEL = 'Is About';

  protected PLACE_EXTRACTION_METHODS: ExtractionArgs<CinemaContextRecord> = [
    { method: PlaceExtractionMethod.WKT, column: 'geom_wkt' }
  ];

  protected entityFactory() {
    return new ScreeningEventEntityFactory();
  }

  protected transform(source: CinemaContextRecord): Draft | undefined {
    const dates = parseProgrammeDate(source.date);
    if (!dates || !source.venue?.name) {
      return undefined;
    }
    return {
      // the permanent id where the source has one; the internal id keeps the rest stable
      id: source.perm_id ?? `programme-${source.programme_id}`,
      url: source.url ?? '',
      label: source.venue.name,
      description: '',
      startDate: dates.startDate,
      endDate: dates.endDate,
      groupKey: source.venue.perm_id ?? null,
    };
  }
}

const ingestor = new CinemaContextIngestor();

export async function ingest(filePath: string) {
  await ingestor.ingest(filePath);
}
