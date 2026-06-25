import { readFileSync } from 'fs';
import { upsertSource, createFeatureWriter, , featureUuid } from '../helpers/helpers';
import { NewFeature } from '../../schema';
import { inferPlaceId, PlaceIndex } from '../helpers/place-extractor';
import { extname } from 'path';
import { parse } from 'csv-parse/sync';
import { EntityFactory, PersonEntityFactory, CreativeWorkEntityFactory, MediaObjectEntityFactory, createEntityFactory, recordType} from '../helpers/entity-factory';
import { EntityBase } from '@atm/shared';

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

    protected abstract transform(source: SourceRecord): Omit<NewFeature, 'recordType'>;

    private _entityFactory: EntityFactory<EntityBase> | undefined;

    protected get entityFactory(): EntityFactory<EntityBase> {
        if (!this._entityFactory) {
            this._entityFactory = createEntityFactory(this.RECORD_TYPE);
        }
        return this._entityFactory;
    }

    private async upsertDatasource() {
        await upsertSource({
            organisation: { id: this.ORG_ID, label: this.ORG_LABEL, url: this.ORG_URL },
            dataset: { id: this.DATASET_ID, label: this.DATASET_LABEL, url: this.DATASET_URL },
            relation: { id: this.RELATION_ID, label: this.RELATION_LABEL },            
        })
    }

    protected extractPlace(newFeature: NewFeature, pi: PlaceIndex) {
        if (!newFeature.description) { 
            return undefined 
        }

        return pi.extract(newFeature.description)
    }

    protected async mapToTargetRecords(sources: SourceRecord[]): Promise<NewFeature[]> {
        const newFeatures:  NewFeature[] = []
        const pi = await PlaceIndex.create()

        const writer = createFeatureWriter(this.BATCH_SIZE)

        let skipped = 0
        let count = 0

        // TODO: keep track of skipped & count properly
        for (const source of sources) {
            const draft: NewFeature = this.transform(source)
            const place = this.extractPlace(draft, pi)
            
            if (!place) { continue; }

            const feature: NewFeature | undefined = await this.constructFeature(draft)

            if (!feature) { continue; }

            const placeId: string | null = await inferPlaceId(feature, place)

            if (!placeId) { continue }
            
            writer.addFeature(feature)
            writer.addLink({ featureId: feature.id!, placeId, relationId: this.RELATION_ID })
            count++;

            await writer.flushIfFull();
            newFeatures.push(feature)
        }

        await writer.flush()
        console.log(`\nDone: ${count} features, ${skipped} skipped (no matching neighbourhood/district)`);

        return newFeatures
    }

    protected async constructFeature(feature: NewFeature): Promise<NewFeature | undefined> {
        feature.id = featureUuid(this.DATASET_ID, feature.id!)
        feature.datasetId = this.DATASET_ID
        feature.recordType = this.RECORD_TYPE
        feature.entity

        return feature
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

        const sourceRecords = this.readFileAsSourceRecords(filePath)
        const targetRecords = await this.mapToTargetRecords(sourceRecords)
    }
}