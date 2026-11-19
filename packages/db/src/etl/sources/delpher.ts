/**
 * Import Delpher newspaper articles
 *
 * Parses a CSV of articles carrying a WGS84 geometry point and a PostgreSQL date range.
 * Each point resolves through the WKT cascade: the places within the per-type distance
 * caps, era-ranked by the article's date, with the article's text confirming a neighbour
 * it names. Articles that resolve no place — or whose range is absent or degenerate — are
 * skipped.
 *
 * Usage: bun run db:ingest -s delpher -f <path-to-delpher_newspapers.csv>
 */
import { Draft, Ingestor } from '../ingest/ingestor';
import { ExtractionArgs, PlaceExtractionMethod } from '../places/place-index';
import { RecordType, parseDateRange } from '@atm/shared';

type DelpherSourceData = {
  id: string;
  url: string;
  title: string;
  text: string;
  period: string;      // PostgreSQL range: "[1974-10-25,1974-10-26)"
  geom_wkt: string;    // "POINT(4.901959 52.376688)" WGS84
  dataset: string;
  tags: string;
}

// the index keeps an article's opening, not its OCR text
const DESCRIPTION_LENGTH = 128;

export class DelpherIngestor extends Ingestor<DelpherSourceData> {
  protected ORG_ID = 'kb';
  protected ORG_LABEL = 'Koninklijke Bibliotheek';
  protected ORG_URL = 'https://www.kb.nl';

  protected DATASET_ID = 'delpher';
  protected DATASET_LABEL = 'Delpher Kranten';
  protected DATASET_URL = 'https://www.delpher.nl';

  protected RECORD_TYPE: RecordType = 'text';
  protected RELATION_ID = 'isAbout';
  protected RELATION_LABEL = 'Is About';

  protected PLACE_EXTRACTION_METHODS: ExtractionArgs<DelpherSourceData> = [
    { method: PlaceExtractionMethod.WKT, column: 'geom_wkt', confirmBy: 'text' }
  ];

  protected transform(source: DelpherSourceData): Draft | undefined {
    // the period is a daterange literal; an empty one leaves the article undated: skipped
    const dates = parseDateRange(source.period);
    if (!dates) {
      return undefined
    }

    return {
      id: source.url,
      url: source.url,
      contentUrl: source.url,
      label: source.title || '',
      description: (source.text || '').slice(0, DESCRIPTION_LENGTH),
      startDate: dates.startDate,
      endDate: dates.endDate
    }
  }
}

const ingestor = new DelpherIngestor()

export async function ingest(filePath:string) {
    await ingestor.ingest(filePath)
}