import { RecordType } from "@atm/shared"
import { ExtractionArgs, PlaceExtractionMethod } from "../helpers/places/place-index"
import { Draft, Ingestor } from "./ingestor"

type ExampleObject = {
  id: string,
  text: string,
  street: string,
  amount: number
}

export class ExampleIngestor extends Ingestor<ExampleObject> {
  protected ORG_ID: string = 'test'
  protected ORG_LABEL: string = 'Test'
  protected ORG_URL: string = 'test.com'
  protected DATASET_ID: string = 'example'
  protected DATASET_LABEL: string = 'Example'
  protected DATASET_URL: string = 'example.test.com'
  protected RECORD_TYPE: RecordType = 'unknown'
  protected RELATION_ID: string = 'testing'
  protected RELATION_LABEL: string = 'is testing'
  
  // Will first try to find a place in the text-column, if not found, fallback on the street-column
  protected PLACE_EXTRACTION_METHODS: ExtractionArgs<ExampleObject> = [
    { method: PlaceExtractionMethod.TEXT, column: 'text' },
    { method: PlaceExtractionMethod.URI, column: 'street'}
  ]

  protected transform(source: ExampleObject): Draft | undefined {
    if (!source.id) { return undefined }
    
    return {
      id: source.id,
      url: 'www.' + source.id + '.com',
      label: source.text,
      startDate: '1900',
      endDate: '1901'
    }
  }
}

const ingestor = new ExampleIngestor()

export async function ingest(filePath:string) {
    await ingestor.ingest(filePath)
}