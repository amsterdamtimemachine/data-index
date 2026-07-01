import { Draft, Ingestor } from "./ingestor";
import { recordType} from '../helpers/entity-factory';
import { ExtractionArgs, PlaceExtractionMethod } from "../helpers/place-extractor";


export interface TestSourceData {
    identifier: string;
    "@id": string;
    headline: string;
    articleBody: string;
    datePublished: string;
}

export class Test extends Ingestor<TestSourceData> {
    protected ORG_ID: string = 'test';
    protected ORG_LABEL: string = 'Test';
    protected ORG_URL: string = 'test.com';

    protected DATASET_ID: string = 'set';
    protected DATASET_LABEL: string = 'Set';
    protected DATASET_URL: string = 'set.test.com';
    
    protected RECORD_TYPE: recordType = recordType.IMAGE;
    protected RELATION_ID: string = 'isAbout';
    protected RELATION_LABEL: string = 'Is About';

    protected PLACE_EXTRACTION_METHODS: ExtractionArgs<TestSourceData> = [
        { method: PlaceExtractionMethod.TEXT, column: 'articleBody' }
    ];

    protected transform(source: TestSourceData): Draft {
        return {
            id: source['@id'],
            url: source['@id'],
            label: source.headline,
            description: source.articleBody,
            startDate: source.datePublished + '-01-01',
            endDate: source.datePublished + '-01-01',
        }
    }
}

const ingestor = new Test()

export async function ingest(filePath:string) {
    await ingestor.ingest(filePath)
}

