/**
 * Import Amsterdam Diaries entries: one dated diary entry as a story, placed at
 * every Amsterdam place it mentions.
 *
 * Reads the JSONL exported from the Amsterdam Diaries Time Machine dump: one line
 * per entry and place, the same entry fields repeated with a different `place`, so
 * the writer links the one feature to each place in turn. A street or address
 * resolves by its Adamlink id, a building or a Wikidata place by its point through
 * the era cascade. The entity carries an excerpt of the transcription per place,
 * each stamped with the index place its mention resolved to, so the card can open
 * the text at the place it shows; the description holds the first excerpt's
 * opening. Dates keep the source's precision: a day, a month, or a year.
 *
 * Usage: bun run db:ingest -s amsterdam-diaries -f <path-to-amsterdam-diaries.jsonl>
 */
import { Draft, Ingestor } from '../ingest/ingestor';
import { ManuscriptEntityFactory } from '../ingest/entity-factory';
import { ExtractionArgs, PlaceExtractionMethod, Resolved } from '../places/place-index';
import { NewFeature } from '../../schema';
import { Excerpt, ManuscriptEntity, RecordType } from '@atm/shared';

type DiaryPlace = { uri: string; name: string; kind: string; geom_wkt: string };

type DiaryEntryRecord = {
  id: string;
  url: string;
  name: string | null;
  date: string | null;
  excerpts: Excerpt[];
  textLength: number;
  diary: { name: string | null; url: string | null; coverage: string | null };
  author: { name: string | null; url: string | null };
  mentions: Array<{ type: 'Place' | 'Person' | 'Organization'; name: string; url: string }>;
  // this row's place, and every Amsterdam place of the entry
  place: DiaryPlace;
  places: DiaryPlace[];
  // the place's Adamlink id when it is one the index holds by id (a street or an
  // address); empty otherwise, so the point takes over
  place_uri?: string;
  geom_wkt?: string;
};

const EXCERPT_LENGTH = 128;

function lastDayOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** The entry's period at the source's precision; null when unparseable. */
export function parseEntryDate(raw: string | null): { startDate: string; endDate: string } | null {
  if (!raw) return null;
  const day = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (day) {
    const [, y, m, d] = day;
    const month = parseInt(m, 10);
    if (month < 1 || month > 12 || parseInt(d, 10) < 1 || parseInt(d, 10) > lastDayOfMonth(parseInt(y, 10), month)) return null;
    return { startDate: raw, endDate: raw };
  }
  const month = raw.match(/^(\d{4})-(\d{2})$/);
  if (month) {
    const [, y, m] = month;
    const mm = parseInt(m, 10);
    if (mm < 1 || mm > 12) return null;
    const last = String(lastDayOfMonth(parseInt(y, 10), mm)).padStart(2, '0');
    return { startDate: `${y}-${m}-01`, endDate: `${y}-${m}-${last}` };
  }
  const year = raw.match(/^(\d{4})$/);
  if (year) {
    return { startDate: `${year[1]}-01-01`, endDate: `${year[1]}-12-31` };
  }
  return null;
}

export class AmsterdamDiariesIngestor extends Ingestor<DiaryEntryRecord> {
  protected ORG_ID = 'amsterdam-time-machine';
  protected ORG_LABEL = 'Amsterdam Time Machine';
  protected ORG_URL = 'https://amsterdamtimemachine.nl';

  protected DATASET_ID = 'amsterdam-diaries';
  protected DATASET_LABEL = 'Amsterdam Diaries Time Machine';
  protected DATASET_URL = 'https://diaries.amsterdamtimemachine.nl';

  protected RECORD_TYPE: RecordType = 'story';
  // the writer named the place; the entry is not about it (Schema.org CreativeWork.mentions)
  protected RELATION_ID = 'mentions';
  protected RELATION_LABEL = 'Mentions';

  protected PLACE_EXTRACTION_METHODS: ExtractionArgs<DiaryEntryRecord> = [
    { method: PlaceExtractionMethod.URI, column: 'place_uri' },
    { method: PlaceExtractionMethod.WKT, column: 'geom_wkt' },
  ];

  protected entityFactory() {
    return new ManuscriptEntityFactory();
  }

  // the place methods read columns of the row: lift the place's id and point to the top
  private placeColumns(row: DiaryEntryRecord, place: DiaryPlace): DiaryEntryRecord {
    row.geom_wkt = place.geom_wkt;
    if (place.kind === 'street' || place.kind === 'address') {
      row.place_uri = place.uri;
    } else {
      row.place_uri = '';
    }
    return row;
  }

  // The base writes an entity the first time it sees a feature, so the first row of
  // an entry resolves every place of the entry and stamps each excerpt; the later
  // rows repeat it from the resolver caches.
  protected async sourceToFeature(source: DiaryEntryRecord): Promise<[NewFeature | undefined, Resolved | undefined]> {
    const [feature, resolved] = await super.sourceToFeature(source);
    if (!feature || !resolved || !('placeId' in resolved)) {
      return [feature, resolved];
    }
    const entity = feature.entity as ManuscriptEntity;
    const draft = { startDate: feature.startDate, endDate: feature.endDate } as Draft;
    for (const excerpt of entity.excerpts) {
      if (excerpt.place === source.place.uri) {
        excerpt.placeId = resolved.placeId;
        continue;
      }
      const place = source.places?.find((p) => p.uri === excerpt.place);
      if (!place) {
        continue;
      }
      const other = await this.extractPlace(this.placeColumns({} as DiaryEntryRecord, place), draft);
      if ('placeId' in other) {
        excerpt.placeId = other.placeId;
      }
    }
    return [feature, resolved];
  }

  protected transform(source: DiaryEntryRecord): Draft | undefined {
    const dates = parseEntryDate(source.date);
    if (!dates || !source.excerpts?.length || !source.place) {
      return undefined;
    }
    this.placeColumns(source, source.place);
    return {
      id: source.id,
      url: source.url,
      label: source.diary?.name || source.name || '',
      description: source.excerpts[0].text.slice(0, EXCERPT_LENGTH),
      startDate: dates.startDate,
      endDate: dates.endDate,
    };
  }
}

export async function ingest(filePath: string) {
  const ingestor = new AmsterdamDiariesIngestor();
  await ingestor.ingest(filePath);
}
