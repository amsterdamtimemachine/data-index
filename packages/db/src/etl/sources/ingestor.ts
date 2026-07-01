import { readFileSync } from 'fs';
import { upsertSource, createFeatureWriter, featureUuid } from '../helpers/helpers';
import { NewFeature } from '../../schema';
import { PlaceIndex, PlaceExtractionMethod, ExtractionArgs } from '../helpers/place-extractor';
import { extname } from 'path';
import { parse } from 'csv-parse/sync';
import { createEntityFactory, EntityFactory, recordType} from '../helpers/entity-factory';
import { EntityBase } from '@atm/shared';

export type Draft = Omit<NewFeature, 'recordType' | 'datasetId'>

export abstract class Ingestor<SourceRecord extends Record<string, any>> {
    protected BATCH_SIZE = 1000;

    protected abstract ORG_ID: string; // Example: 'my-org';
    protected abstract ORG_LABEL: string; // Example: 'My Organisation';
    protected abstract ORG_URL: string; // Example: 'https://org-url.com';


    protected abstract DATASET_ID: string; // Example: 'my-dataset';
    protected abstract DATASET_LABEL: string; // Example: 'My Dataset';
    protected abstract DATASET_URL: string; // Example: 'https://dataset-url.com';

    protected abstract RECORD_TYPE: recordType; // Possible values: 'image' | 'text' | 'person'
    protected abstract RELATION_ID: string; // Example: 'isAbout';
    protected abstract RELATION_LABEL: string; // Example: 'Is About';

    protected abstract PLACE_EXTRACTION_METHODS: ExtractionArgs<SourceRecord>;

    protected abstract transform(source: SourceRecord): Draft | undefined;

    protected pi: PlaceIndex<SourceRecord> | undefined;
    protected ef: EntityFactory<EntityBase> | undefined;
    protected writer: any; // TODO: could do some better type-checking here. 

    private async upsertDatasource() {
        await upsertSource({
            organisation: { id: this.ORG_ID, label: this.ORG_LABEL, url: this.ORG_URL },
            dataset: { id: this.DATASET_ID, label: this.DATASET_LABEL, url: this.DATASET_URL },
            relation: { id: this.RELATION_ID, label: this.RELATION_LABEL },            
        })
    }

    protected async extractPlace(source: SourceRecord) {
        return this.pi!.extract(source)
    }

    protected async writeFeature(feature: NewFeature, placeId: string) {
        this.writer.addFeature(feature)
        this.writer.addLink({ featureId: feature.id, placeId, relationId: this.RELATION_ID })

        await this.writer.flushIfFull();
    }

    protected constructFeature(feature: Draft, entity: EntityBase): NewFeature {
        return {
            ...feature,
            id: featureUuid(this.DATASET_ID, feature.id),
            datasetId: this.DATASET_ID,
            recordType: this.RECORD_TYPE,
            entity: entity
        } as NewFeature
    }

    protected validate(feature: NewFeature) {
        // TODO: validate feature to have all required properties
    }

    protected async sourceToFeature(source: SourceRecord): Promise<[NewFeature | undefined, string | undefined]> {
        const draft: Draft | undefined = this.transform(source)

        if (!draft) { return [undefined, undefined] }

        const placeId = await this.extractPlace(source)
        const entity: EntityBase = this.ef!.create(draft, new Map<string, any>(Object.entries(source as object)))
        const feature = this.constructFeature(draft, entity) as NewFeature

        return [feature, placeId]
    }

    protected async ingestSourceRecords(sources: SourceRecord[]) {
        const uuids = []

        let skipped = 0
        let duplicates = 0

        for (const source of sources) {
            const [feature, placeId] =  await this.sourceToFeature(source)
            
            if (!placeId || !feature) { skipped++; continue; }
            if (feature.id in uuids) { duplicates++; skipped++; continue; }

            await this.writeFeature(feature, placeId)

            uuids.push(feature.id)
        }

        await this.writer.flush()
        console.log(`\nDone: ${uuids.length} features, ${duplicates} duplicates found, ${skipped} skipped (no matching neighbourhood/district)`);
    }

    protected readFileAsSourceRecords(filePath: string): SourceRecord[] {
        const extension = extname(filePath);
        const content = readFileSync(filePath, 'utf8');

        switch (extension) {
            case '.json':
                return JSON.parse(content) as SourceRecord[]
            case '.csv':
                return parse(content, { columns: true, skip_empty_lines: true }) as SourceRecord[];
            default:
                return []
        }
    }

    public async ingest(filePath: string) {
        await this.upsertDatasource();

        this.pi = await PlaceIndex.create(this.PLACE_EXTRACTION_METHODS)
        this.ef = createEntityFactory(this.RECORD_TYPE)
        this.writer = createFeatureWriter(this.BATCH_SIZE)

        const sourceRecords = this.readFileAsSourceRecords(filePath)
        
        await this.ingestSourceRecords(sourceRecords)
    }
}