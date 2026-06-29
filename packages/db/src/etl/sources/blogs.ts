import { recordType } from "../helpers/entity-factory";
import { Draft, Ingestor } from "./ingestor";


interface BlogData {
    identifier: string;
    "@id": string;
    headline: string;
    articleBody: string;
    datePublished: string;
}

export class AmsterdamBlogsIngestor extends Ingestor<BlogData> {
  protected ORG_ID: string = 'amsterdam-museum';
  protected ORG_LABEL: string = 'Amsterdam Museum';
  protected ORG_URL: string = 'https://www.amsterdammuseum.nl/';

  protected DATASET_ID: string = 'corona-blogs';
  protected DATASET_LABEL: string = 'Corona Blogs';
  protected DATASET_URL: string = '---';
  
  protected RECORD_TYPE: recordType = recordType.TEXT;
  protected RELATION_ID: string = 'isAbout';
  protected RELATION_LABEL: string = 'Is About';

  protected transform(source: BlogData): Draft {
      return {
          id: source['@id'],
          url: source['@id'],
          label: source.headline,
          description: source.articleBody,
          startDate: source.datePublished + '-01-01',
          endDate: source.datePublished + '-01-01',
          inferLocationFromText: source.articleBody
      }
  }
}