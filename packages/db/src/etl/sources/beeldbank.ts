import { RecordType } from "@atm/shared";
import { ExtractionArgs, PlaceExtractionMethod } from "../places/place-index";
import { Draft, Ingestor } from "../ingest/ingestor";

type BeeldbankData = {
  resource: string;
  title: string;
  thumbnail: string;
  creationDateItem: string;
  startDate: string;
  endDate: string;
  textDate: string;
  pand: string;
  address: string;
  street: string;
}

export class BeeldbankIngestor extends Ingestor<BeeldbankData> {
  protected ORG_ID: string = 'stadsarchief';
  protected ORG_LABEL: string = 'Amsterdam Stadsarchief';
  protected ORG_URL: string = 'https://archief.amsterdam';

  protected DATASET_ID: string = 'beeldbank';
  protected DATASET_LABEL: string = 'Beeldbank';
  protected DATASET_URL: string = 'https://archief.amsterdam/beeldbank';

  protected RECORD_TYPE: RecordType = 'image';
  protected RELATION_ID: string = 'isAbout';
  protected RELATION_LABEL: string = 'is about';

  protected PLACE_EXTRACTION_METHODS: ExtractionArgs<BeeldbankData> = [
    {method: PlaceExtractionMethod.URI, column: 'address'},
    {method: PlaceExtractionMethod.URI, column: 'street'}
  ];

  protected transform(source: BeeldbankData): Draft | undefined {
    const resource = source.resource?.trim();
    
    if (!resource) return undefined;

    const id = resource.split('/').pop();
    if (!id) return undefined;

    const startDate = source.startDate?.trim() || ''

    return {
      id,
      label: source.title?.trim() || '',
      url: `https://id.archief.amsterdam/${id}`,
      contentUrl: source.thumbnail?.trim() || '',
      startDate: startDate,
      endDate: source.endDate?.trim() || startDate,
    };
  }
}

const ingestor = new BeeldbankIngestor()

export async function ingest(filePath:string) {
    await ingestor.ingest(filePath)
}