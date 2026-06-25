import { EntityBase } from "@atm/shared";
import { NewFeature } from "../../schema";
import { Ingestor } from "./ingestor";
import { recordType} from '../helpers/entity-factory';

interface TestSourceData {
    identifier: string;
    "@id": string;
    headline: string;
    articleBody: string;
    url: string;
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

    protected transform(source: TestSourceData): Omit<NewFeature, "recordType"> {
        return {
            id: source['@id'],
            label: source.headline,
            description: source.articleBody,
            startDate: source.datePublished + '-01-01',
            endDate: source.datePublished + '-01-01',
            url: source.url,
            contentUrl: source.url,
        }
    }

    protected createEntity(source: TestSourceData): EntityBase {
        
    }
}

const ingestor = new Test()

export async function ingest(filePath:string) {
    await ingestor.ingest(filePath)
}

