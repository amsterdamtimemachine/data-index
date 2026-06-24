import { Ingestor, TargetRecord } from "./ingestor";

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
    protected RECORD_TYPE: string = 'text';
    protected RELATION_ID: string = 'isAbout';
    protected RELATION_LABEL: string = 'Is About';

    protected transform(source: TestSourceData): Omit<TargetRecord, "level" | "area"> & { area?: string; level?: "wijk" | "buurt"; } {
        return {
            id: source["@id"],
            title: source.headline,
            description: source.articleBody,
            dateStart: source.datePublished + '-01-01',
            dateEnd: source.datePublished + '-01-2'
        }
    }
}

const ingestor = new Test()

export async function ingest(filePath:string) {
    await ingestor.ingest(filePath)
}