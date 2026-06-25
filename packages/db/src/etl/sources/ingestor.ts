import { readFileSync } from 'fs';
import { upsertSource, createFeatureWriter, , featureUuid } from '../helpers/helpers';
import { NewFeature, Place } from '../../schema';
import { inferPlaceId, PlaceIndex } from '../helpers/place-extractor';
import { extname } from 'path';
import { parse } from 'csv-parse/sync';
import { createEntityFactory, EntityFactory, recordType} from '../helpers/entity-factory';
import { EntityBase } from '@atm/shared';

export type Draft<NewFeature> = Omit<NewFeature, 'recordType'>;

export abstract class Ingestor<SourceRecord> {
    protected target: NewFeature | undefined;
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

    protected abstract transform(source: SourceRecord): Draft<NewFeature>;

    protected pi: PlaceIndex | undefined;
    protected ef: EntityFactory<EntityBase> | undefined;
    protected writer: any; // TODO: could do some better type-checking here. 

    private async upsertDatasource() {
        await upsertSource({
            organisation: { id: this.ORG_ID, label: this.ORG_LABEL, url: this.ORG_URL },
            dataset: { id: this.DATASET_ID, label: this.DATASET_LABEL, url: this.DATASET_URL },
            relation: { id: this.RELATION_ID, label: this.RELATION_LABEL },            
        })
    }

    protected extractPlace(feature: Draft<NewFeature>) {
        if (!feature.description) { 
            return undefined 
        }

        const place = this.pi!.extract(feature.description)

        if (!place) { return null }

        return await inferPlaceId(feature, place)
    }

    protected sourceToFeature(source: SourceRecord) {
        const draft: Draft<NewFeature> = this.transform(source)
        const entity: EntityBase = this.ef!.create(draft, new Map<string, any>(Object.entries(source as object)))

        return await this.constructFeature(draft, entity) as NewFeature
    }

    protected writeFeature(feature: NewFeature, placeId: string) {
        this.writer.addFeature(feature)
        this.writer.addLink({ featureId: feature.id!, placeId, relationId: this.RELATION_ID })

        await this.writer.flushIfFull();
    }

    protected async ingestSourceRecords(sources: SourceRecord[]): Promise<NewFeature[]> {
        const newFeatures:  NewFeature[] = []

        let skipped = 0

        for (const source of sources) {
            const feature: NewFeature = this.sourceToFeature(source)
            const placeId = this.extractPlace(feature)
            
            if (!placeId) { skipped++; continue; }

            this.writeFeature(feature, placeId)

            newFeatures.push(feature)
        }

        await this.writer.flush()
        console.log(`\nDone: ${newFeatures.length} features, ${skipped} skipped (no matching neighbourhood/district)`);

        return newFeatures
    }

    protected async constructFeature(feature: Draft<NewFeature>, entity: EntityBase): Promise<NewFeature> {
        return {
            ...feature,
            id: featureUuid(this.DATASET_ID, feature.id),
            datasetId: this.DATASET_ID,
            recordType: this.RECORD_TYPE,
            entity: entity
        } as NewFeature
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

        this.pi = await PlaceIndex.create()
        this.ef = createEntityFactory(this.RECORD_TYPE)
        this.writer = createFeatureWriter(this.BATCH_SIZE)

        const sourceRecords = this.readFileAsSourceRecords(filePath)
        
        await this.ingestSourceRecords(sourceRecords)
    }
}