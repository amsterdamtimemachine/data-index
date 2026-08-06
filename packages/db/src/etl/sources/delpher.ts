/**
 * Import Delpher newspaper articles
 *
 * Parses a CSV of articles carrying a WGS84 geometry point and a PostgreSQL date range.
 * Each point resolves through the WKT cascade (inferByPoint): the nearest place per source
 * within the per-type distance caps, era-ranked by the article's date. Articles that
 * resolve no place — or whose range is absent or degenerate — are skipped.
 *
 * Usage: bun run db:ingest -s delpher -f <path-to-delpher_newspapers.csv>
 */
import { Draft, Ingestor } from './ingestor';
import { NewFeature } from '../../schema';
import { ExtractionArgs, PlaceExtractionMethod } from '../helpers/places/place-index';
import { RecordType } from '@atm/shared';

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

// Postgres daterange output is canonically [start,end): exclusive upper bound. The rest of
// the app reads end_date INCLUSIVELY, so map the exclusive bound to the inclusive last day
// (end − 1). UTC-safe — avoids the local-tz year-shift that afflicts new Date(dateOnly).
function inclusiveEnd(iso: string): string {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

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
    { method: PlaceExtractionMethod.WKT, column: 'geom_wkt' }
  ];

  private parsePeriod(period: string): { startDate: string | null; endDate: string | null } {
    const match = period.match(/[\[(\s]*(\d{4}-\d{2}-\d{2})\s*,\s*(\d{4}-\d{2}-\d{2})\s*([)\]])/);
    if (!match) { return { startDate: null, endDate: null } }

    const startDate = match[1];
    // exclusive ')' end → inclusive last day (end − 1); an inclusive ']' closer stays as-is.
    const endDate = match[3] === ')' ? inclusiveEnd(match[2]) : match[2];
    // degenerate/empty range (e.g. [d,d)) inverts after the shift → treat as undated (skip).
    if (endDate < startDate) { return { startDate: null, endDate: null } }

    return { startDate, endDate };
  }

  private truncate(text: string): string {
    return text ? text.slice(0, 128) : '';
  }

  // @override from ingestor.ts, 'cause we have to truncate the description
  // at the last step
  protected async writeFeature(feature: NewFeature, placeId: string): Promise<void> {
    feature.description = this.truncate(feature.description!)
    
    this.writer.addFeature(feature)
    this.writer.addLink({ featureId: feature.id, placeId, relationId: this.RELATION_ID })

    await this.writer.flushIfFull();
  }
  
  protected transform(source: DelpherSourceData): Draft | undefined {
    const dates = this.parsePeriod(source.period)

    if (!dates.startDate || !dates.endDate) {
      return undefined
    }

    return {
      id: source.url,
      url: source.url,
      contentUrl: source.url,
      label: source.title || '',
      description: source.text || '',
      startDate: dates.startDate,
      endDate: dates.endDate
    }
  }
}

const ingestor = new DelpherIngestor()

export async function ingest(filePath:string) {
    await ingestor.ingest(filePath)
}