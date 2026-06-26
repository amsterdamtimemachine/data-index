/**
 * Import Delpher newspaper articles
 *
 * Parses CSV of newspaper articles with geometry points.
 * Matches each point to the nearest address place via spatial lookup.
 * Unmatched features (no place within threshold) are skipped.
 *
 * Usage: bun run db:ingest -s delpher -f <path-to-delpher_newspapers.csv>
 */
import { Draft, Ingestor } from './ingestor';
import { recordType } from '../helpers/entity-factory';

interface DelpherSourceData {
  id: string;
  url: string;
  title: string;
  text: string;
  period: string;      // PostgreSQL range: "[1974-10-25,1974-10-26)"
  geom_wkt: string;    // "POINT(4.901959 52.376688)" WGS84
  dataset: string;
  tags: string;
}

export class Delpher extends Ingestor<DelpherSourceData> {
  protected ORG_ID = 'kb';
  protected ORG_LABEL = 'Koninklijke Bibliotheek';
  protected ORG_URL = 'https://www.kb.nl';

  protected DATASET_ID = 'delpher';
  protected DATASET_LABEL = 'Delpher Kranten';
  protected DATASET_URL = 'https://www.delpher.nl';

  protected RECORD_TYPE = recordType.TEXT;
  protected RELATION_ID = 'isAbout';
  protected RELATION_LABEL = 'Is About';

  private parsePeriod(period: string): { startDate: string | null; endDate: string | null } {
    // Format: [start,end) — inclusive start, exclusive end
    const match = period.match(/[\[(\s]*(\d{4}-\d{2}-\d{2})\s*,\s*(\d{4}-\d{2}-\d{2})\s*[)\]]/);
    
    if (!match) {
      return { startDate: null,  endDate: null }
    };
    
    return { startDate: match[1], endDate: match[2]};
  }  
  
  protected transform(source: DelpherSourceData): Draft {
    const dates = this.parsePeriod(source.period)

    return {
      id: source.url,
      url: source.url,
      contentUrl: source.url,
      label: source.title || '',
      description: source.text || '',
      startDate: dates.startDate,
      endDate: dates.endDate,
      wkt: source.geom_wkt
    } as Draft
  }
}