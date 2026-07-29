import { RecordType } from "@atm/shared";
import { ExtractionArgs, PlaceExtractionMethod } from "../helpers/places/place-index";
import { Draft, Ingestor } from "./ingestor";

type JoodsMonumentData = {
  person: string;
  name: string;
  location: string;
  birthPlace: string;
  birthDate: string;
  deathDate: string;
  deathPlace: string;
  address: string;
  addressName: string;
}

export class JoodsMonumentIngestor extends Ingestor<JoodsMonumentData> {
  protected ORG_ID = 'joods-monument';
  protected ORG_LABEL = 'Joods Monument';
  protected ORG_URL = 'https://www.joodsmonument.nl';

  protected DATASET_ID = 'joods-monument';
  protected DATASET_LABEL = 'Joods Monument';
  protected DATASET_URL = 'https://www.joodsmonument.nl';

  protected RECORD_TYPE: RecordType = 'person';
  protected RELATION_ID = 'hadLastLivingLocation';
  protected RELATION_LABEL = 'Had last living location';

  private START_DATE = '1900-01-01';
  private END_DATE = '1945-12-31';

  protected PLACE_EXTRACTION_METHODS: ExtractionArgs<JoodsMonumentData> = [
    { method: PlaceExtractionMethod.URI, column: 'address'}
  ];

  private extractId(url: string) {
    return url.match(/\/page\/(\d+)/)?.[1];
  }

  protected transform(source: JoodsMonumentData): Draft | undefined {
    const id = this.extractId(source.person)

    if (!id) { return undefined }
    
    return {
      id: id,
      label: source.name,
      url: source.person,
      startDate: this.START_DATE,
      endDate: this.END_DATE,
    }
  }
}

const ingestor = new JoodsMonumentIngestor()

export async function ingest(filePath:string) {
    await ingestor.ingest(filePath)
}