import { readFileSync, write } from 'fs';
import { sql } from 'drizzle-orm';
import { db } from '../../client';
import type { PlaceIdRow } from '../../row-types';
import type { CreativeWorkEntity } from '@atm/shared';
import { upsertSource, createFeatureWriter, createCachedResolver, formatDateRange, featureUuid } from '../helpers/helpers';
import { NewFeature } from '../../schema';
import { constructTrie, getPlaceMap, match, node, PlaceIndex } from '../helpers/place-extractor';
import { extname } from 'path';
import { parse } from 'csv-parse/sync';

export interface TargetRecord {
    id: string;
    url?: string;
    contentUrl?: string;    
    title: string;
    description?: string;     // optional → features.description (shown on the card)
    author?: string;          // optional → an example of schema.org entity (JSONB) metadata
    area: string;             // neighbourhood / district name → matched to place.preferred_label
    level: string;  // → place.type (district / neighbourhood)
    dateStart: string | null;       // "YYYY-MM-DD" — with date_end, selects the era by range overlap
    dateEnd: string | null;
}

export type DraftRecord = Omit<TargetRecord, 'area' | 'level'> & {
  area?: string;
  level?: string;
};

type InferPlaceArgs = {
    level: string;
    area: string;
    start: string;
    end: string;
};

export abstract class Ingestor<SourceRecord> {
    protected target: TargetRecord | undefined;
    protected BATCH_SIZE = 1000;

    protected abstract ORG_ID: string; // Example: 'my-org';
    protected abstract ORG_LABEL: string; // Example: 'My Organisation';
    protected abstract ORG_URL: string; // Example: 'https://org-url.com';


    protected abstract DATASET_ID: string; // Example: 'my-dataset';
    protected abstract DATASET_LABEL: string; // Example: 'My Dataset';
    protected abstract DATASET_URL: string; // Example: 'https://dataset-url.com';

    protected abstract RECORD_TYPE: string; // Possible values: 'image' | 'text' | 'person'
    protected abstract RELATION_ID: string; // Example: 'isAbout';
    protected abstract RELATION_LABEL: string; // Example: 'Is About';

    protected abstract transform(source: SourceRecord): DraftRecord;

    private readonly inferPlaceIdCached = createCachedResolver(async (key: string) => {
        const { level, area, start, end } = JSON.parse(key) as InferPlaceArgs;

        const result = await db.execute<PlaceIdRow>(sql`
            SELECT id as place_id
            FROM place
            WHERE preferred_label ILIKE ${area}
            AND (
                (valid_since IS NULL AND valid_until IS NULL)
                OR (
                    valid_since <= ${end}::date
                    AND (valid_until IS NULL OR valid_until > ${start}::date)
                )
            )
            ORDER BY GREATEST(
                        0,
                        LEAST(${end}::date, COALESCE(valid_until, 'infinity'::date))
                        - GREATEST(${start}::date, valid_since)
                    ) DESC,
                    valid_since DESC
            LIMIT 1
        `);

        return result.rows[0]?.place_id ?? null;
    });

    private async inferPlaceId(target: TargetRecord) {
        const { level, area, dateStart: date_start, dateEnd: date_end } = target;
        const start = date_start;
        const end = date_end || date_start;

        const key = JSON.stringify({ level, area, start, end });
        return this.inferPlaceIdCached(key);
    }

    private async upsertDatasource() {
        await upsertSource({
            organisation: { id: this.ORG_ID, label: this.ORG_LABEL, url: this.ORG_URL },
            dataset: { id: this.DATASET_ID, label: this.DATASET_LABEL, url: this.DATASET_URL },
            relation: { id: this.RELATION_ID, label: this.RELATION_LABEL },            
        })
    }

<<<<<<< HEAD
    protected constructTargetFromDraft(draft: DraftRecord, pi: PlaceIndex): TargetRecord | undefined {
=======
    private async getPlaceMap() {
        const allPlaces = await db.execute<{ preferred_label: string, type: string }>(sql`
            SELECT DISTINCT preferred_label, type FROM place  
        `);

        const placeMap = new Map<string, { label: string; level: string }>(
            allPlaces.rows
                .filter(row => row.preferred_label != null)
                .map(row => [
                    row.preferred_label.toLowerCase(),
                    {
                        label: row.preferred_label, // Preserves original DB casing if needed
                        level: row.type
                    }
                ])
        );

        return placeMap;
    }

    protected constructTargetFromDraft(draft: DraftRecord, placesPattern: RegExp, placeMap: Map<string, any>): TargetRecord | undefined {
>>>>>>> 3ce5987 (setup trie-structure for place-detection)
        if (!draft.description) { 
            return undefined 
        }

        const place = pi.extract(draft.description)

        if (!place) { 
            return undefined 
        }

        return {
            ...draft,
            area: place.area,
            level: place.level
        } as TargetRecord
    }

    protected async infer_preferred_places(drafts: DraftRecord[]): Promise<TargetRecord[]> {
<<<<<<< HEAD
=======
        const placeMap = await this.getPlaceMap()

        const placeNames = Array.from(placeMap.keys())
            .map(name => name.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'))
            .sort((a, b) => b.length - a.length); // longest first

        const placesPattern = new RegExp(
            `\\b(${placeNames.join('|')})\\b`,
            'gi'
        );

>>>>>>> 3ce5987 (setup trie-structure for place-detection)
        const targets: TargetRecord[] = []
        let skipped = 0;

        const pi = await PlaceIndex.create()

        for (const draft of drafts) {
            const target = this.constructTargetFromDraft(draft, pi)

            if (!target) { 
                skipped++; 
                continue;
            }

            targets.push(target)
        }

        return targets
    }

    protected async mapToTargetRecords(sources: SourceRecord[]): Promise<TargetRecord[]> {
        const drafts:  DraftRecord[] = []

        for (const source of sources) {
            const draft: DraftRecord = this.transform(source)

            drafts.push(draft)
        }

        const targets: TargetRecord[] = await this.infer_preferred_places(drafts)

        return targets
    }

    protected async constructFeature(target: TargetRecord): Promise<NewFeature | undefined> {
        if (!target.area || !target.level) { return undefined }

        const featureId = featureUuid(target.id)
        const startDate = target.dateStart || null
        const endDate = target.dateEnd || startDate
        const dateCreated = formatDateRange(startDate, endDate)

        // TODO: we could more abstractly create this entity
        const entity: CreativeWorkEntity = {
            type: 'CreativeWork',
            name: target.title || '',
            ...(target.author && { author: target.author }),
            ...(dateCreated && { dateCreated })
        };
        
        return {
            id: featureId,
            url: target.url,
            contentUrl: target.url,
            recordType: this.RECORD_TYPE,
            label: target.title || '',
            description: target.description || null,
            startDate,
            endDate,
            datasetId: this.DATASET_ID,
            entity
        } as NewFeature
    }

    protected readFileAsSourceRecord(filePath: string): SourceRecord[] {
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

        const sourceRecords = this.readFileAsSourceRecord(filePath)
        const targetRecords = await this.mapToTargetRecords(sourceRecords)

        const writer = createFeatureWriter(this.BATCH_SIZE)

        let skipped = 0
        let count = 0
        for (const target of targetRecords) {
            const feature: NewFeature | undefined = await this.constructFeature(target)
            if (!feature) { 
                skipped++; continue; 
            }

            const placeId: string | null = await this.inferPlaceId(target)
            if (!placeId) { 
                skipped++; continue 
            }

            writer.addFeature(feature)
            writer.addLink({ featureId: feature.id!, placeId, relationId: this.RELATION_ID })
            count++;

            await writer.flushIfFull();
        }

        await writer.flush()
        console.log(`\nDone: ${count} features, ${skipped} skipped (no matching neighbourhood/district)`);
    }
}