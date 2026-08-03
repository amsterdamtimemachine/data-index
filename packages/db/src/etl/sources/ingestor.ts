import { upsertSource, createFeatureWriter, featureUuid } from '../helpers/helpers';
import { NewFeature } from '../../schema';
import { createEntityFactory, EntityFactory } from '../helpers/entity-factory';
import { EntityBase, RecordType } from '@atm/shared';
import { FileReader } from '../helpers/file-reader';
import { DateRange, ExtractionArgs, PlaceIndex } from '../helpers/places/place-index';

export type Draft = Omit<NewFeature, 'recordType' | 'datasetId'>

/**
 * Abstract class used for ingesting datasets. Use as follows:
 * 1. Create new file, create a new exportable class extending this Ingestor-class
 * 2. Create a data-interface object corresponding to the structure of an object in the dataset
 *   2.1 Place the data-interface object as type-argument in the extension (between <>)
 * 3. Defined all required abstract propterties
 * 4. Implement the abstract-transform method, mapping the data-interface object to a more db-ready object
 * 5. Define & export a ingest(filePath: string) function (call the ingest func in it) at the end of the file
 */
export abstract class Ingestor<SourceRecord extends Record<string, unknown>> {
    protected BATCH_SIZE = 1000;

    protected abstract ORG_ID: string; // Example: 'my-org';
    protected abstract ORG_LABEL: string; // Example: 'My Organisation';
    protected abstract ORG_URL: string; // Example: 'https://org-url.com';


    protected abstract DATASET_ID: string; // Example: 'my-dataset';
    protected abstract DATASET_LABEL: string; // Example: 'My Dataset';
    protected abstract DATASET_URL: string; // Example: 'https://dataset-url.com';

    protected abstract RECORD_TYPE: RecordType; // Possible values: 'image' | 'text' | 'person'
    protected abstract RELATION_ID: string; // Example: 'isAbout';
    protected abstract RELATION_LABEL: string; // Example: 'Is About';

    protected abstract PLACE_EXTRACTION_METHODS: ExtractionArgs<SourceRecord>;

    protected abstract transform(source: SourceRecord): Draft | undefined;

    protected pi: PlaceIndex<SourceRecord> | undefined;
    protected ef: EntityFactory<EntityBase> | undefined;
    protected fr: FileReader<SourceRecord> | undefined;
    protected writer: any; // TODO: could do some better type-checking here. 

    /**
     * Appends the metadata of the (concrete) class to the database
     */
    private async upsertDatasource() {
        await upsertSource({
            organisation: { id: this.ORG_ID, label: this.ORG_LABEL, url: this.ORG_URL },
            dataset: { id: this.DATASET_ID, label: this.DATASET_LABEL, url: this.DATASET_URL },
            relation: { id: this.RELATION_ID, label: this.RELATION_LABEL },            
        })
    }

    /**
     * Extract the place from a source-record. 
     * @param source 
     * @param draft necessary to extract the dates from the object. 
     * @returns place_id of place found within SourceRecord
     */
    protected async extractPlace(source: SourceRecord, draft: Draft) {
        const dateRange = { start: draft.startDate, end: draft.endDate } as DateRange
        return this.pi!.extract(source, dateRange)
    }

    /**
     * Maps the draft & entity to a complete NewFeature-object ready for database ingestion
     * @param feature 
     * @param entity 
     * @returns Database-ready NewFeature-object
     */
    protected constructFeature(feature: Draft, entity: EntityBase): NewFeature {
        return {
            ...feature,
            id: featureUuid(this.DATASET_ID, feature.id),
            datasetId: this.DATASET_ID,
            recordType: this.RECORD_TYPE,
            entity: entity
        } as NewFeature
    }

    /**
     * First transforms a SourceRecord to a Draft (temp object), then extracts place & creates corresponding entity. At last, construct db-ready feature-object
     * @param source 
     * @returns array containing the feature-object and corresponding place_id
     */
    protected async sourceToFeature(source: SourceRecord): Promise<[NewFeature | undefined, string | undefined]> {
        const draft: Draft | undefined = this.transform(source)

        if (!draft) { return [undefined, undefined] }

        const placeId = await this.extractPlace(source, draft)
        const entity: EntityBase = this.ef!.create(draft, new Map<string, any>(Object.entries(source as object)))
        const feature = this.constructFeature(draft, entity) as NewFeature

        return [feature, placeId]
    }

    /**
     * Loops over the provided sourcerecords, transforming them to (db-ready) features, and writing them to the database
     * @param sources asynciterable of source-records. Can be obtained using the FileReader-class
     */
    protected async ingestSourceRecords(sources: AsyncIterable<SourceRecord>) {
        const fMap = new Map<string, Set<string>>();

        let skipped = 0
        let duplicates = 0

        for await (const source of sources) {
            try {
                const [feature, placeId] =  await this.sourceToFeature(source)
                
                if (!placeId || !feature) { 
                    skipped++; continue; 
                }

                if (!fMap.has(feature.id)) { 
                    this.writer.addFeature(feature)
                    fMap.set(feature.id, new Set<string>())
                }
                
                if (!fMap.get(feature.id)!.has(placeId)) {
                    this.writer.addLink({ featureId: feature.id, placeId: placeId, relationId: this.RELATION_ID })
                    fMap.get(feature.id)?.add(placeId)
                }
            } catch (error) {
                console.error(`Failed to process row: ${source}:`, error)
                skipped++;
            }

            await this.writer.flushIfFull()
        }

        await this.writer.flush()
        console.log(`\nDone: ${fMap.size} features, ${duplicates} duplicates found, ${skipped} skipped (no matching neighbourhood/district)`);
    }

    /**
     * function called by ingestion-script(s). It creates the necessary sub-classes, reads the data-file, & calls ingestions of the records
     * @param filePath 
     * @returns -
     */
    public async ingest(filePath: string) {
        await this.upsertDatasource();

        this.pi = await PlaceIndex.create(this.PLACE_EXTRACTION_METHODS)
        this.ef = createEntityFactory(this.RECORD_TYPE)
        this.writer = createFeatureWriter(this.BATCH_SIZE)
        this.fr = new FileReader()

        const fileStream = this.fr.createFileReadStream(filePath)
        if (!fileStream) { console.log('Failed to load & parse file to correct format.'); return; }
        
        await this.ingestSourceRecords(fileStream)
    }
}