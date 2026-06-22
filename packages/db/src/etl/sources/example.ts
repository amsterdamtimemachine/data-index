import { Ingestor, TargetRecord } from "./ingestor";

interface TestSourceData {
    identifier: string;
    "@id": string;
    headline: string;
    articleBody: string;
    url: string;
    datePublished: string;
}

export class Example extends Ingestor<TestSourceData> {
    protected ORG_ID: string;
    protected ORG_LABEL: string;
    protected ORG_URL: string;

    protected DATASET_ID: string;
    protected DATASET_LABEL: string;
    protected DATASET_URL: string;

    protected RECORD_TYPE: string;
    protected RELATION_ID: string;
    protected RELATION_LABEL: string;

    protected transform(source: TestSourceData): Omit<TargetRecord, "area" | "level"> & { area?: string; level?: string; } {

    }

}
