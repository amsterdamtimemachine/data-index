import { readFileSync, write } from 'fs';
import { sql } from 'drizzle-orm';
import { db } from '../../client';
import type { PlaceIdRow } from '../../row-types';
import type { CreativeWorkEntity } from '@atm/shared';
import { upsertSource, createFeatureWriter, createCachedResolver, formatDateRange, featureUuid } from '../helpers';
import { NewFeature } from '../../schema';

export interface TargetRecord {
    id: string;
    title: string;
    description?: string;     // optional → features.description (shown on the card)
    author?: string;          // optional → an example of schema.org entity (JSONB) metadata
    area: string;             // neighbourhood / district name → matched to place.preferred_label
    level: string;  // → place.type (district / neighbourhood)
    date_start: string;       // "YYYY-MM-DD" — with date_end, selects the era by range overlap
    date_end: string;
}

type DraftRecord = Omit<TargetRecord, 'area' | 'level'> & {
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

    // ═══════════════════════════════════════════════════════════════
    //  Organisation
    // ═══════════════════════════════════════════════════════════════
    protected abstract ORG_ID: string; // Example: 'my-org';
    protected abstract ORG_LABEL: string; // Example: 'My Organisation';
    protected abstract ORG_URL: string; // Example: 'https://org-url.com';

    // ═══════════════════════════════════════════════════════════════
    //  Dataset
    // ═══════════════════════════════════════════════════════════════
    protected abstract DATASET_ID: string; // Example: 'my-dataset';
    protected abstract DATASET_LABEL: string; // Example: 'My Dataset';
    protected abstract DATASET_URL: string; // Example: 'https://dataset-url.com';

    // ═══════════════════════════════════════════════════════════════
    //  Feature metadata
    // ═══════════════════════════════════════════════════════════════
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

        const r = result.rows[0]?.place_id ?? null;

        return r
    });

    private async inferPlaceId(target: TargetRecord) {
        const { level, area, date_start, date_end } = target;
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

    private async getPlaceMap() {
        const allPlaces = await db.execute<{ preferred_label: string, type: string }>(sql`
            SELECT DISTINCT preferred_label, type FROM place WHERE type IN ('district', 'neighbourhood', 'street')    
        `);

        const placeMap = new Map<string, { label: string; level: string }>(
            allPlaces.rows.map(row => [
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
        if (!draft.description) { 
            return undefined 
        }

        const matchedPlaces = draft.description.match(placesPattern)

        if (!matchedPlaces || matchedPlaces.length <= 0) {
            return undefined 
        }

        const matches = [...new Set(
            matchedPlaces.map(m => m.toLocaleLowerCase())
            .sort((a, b) => b.length - a.length || a.localeCompare(b)
        ))]// TODO: allow multiple places

        const match = matches[0]
        const place = placeMap.get(match)

        if (!place) { 
            console.log(match, 'not found in map')
            return undefined 
        }

        return {
            ...draft,
            area: place.label,
            level: place.level
        } as TargetRecord
    }

    protected async infer_preferred_places(drafts: DraftRecord[]): Promise<TargetRecord[]> {
        const placeMap = await this.getPlaceMap()

        const placesPattern = new RegExp(
            `\\b(${Array.from(placeMap.keys())
                .map(name => name.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'))
                .join('|')})\\b`, 
            'gi'
        );

        const targets: TargetRecord[] = []
        let skipped = 0;

        for (const draft of drafts) {
            const target = this.constructTargetFromDraft(draft, placesPattern, placeMap)

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
        if (!target.area || !target.level || !target.date_start) { return undefined }

        const featureId = featureUuid(target.id)
        const startDate = target.date_start || null
        const endDate = target.date_end || startDate
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
            url: target.id,
            recordType: this.RECORD_TYPE,
            label: target.title || '',
            description: target.description || null,
            startDate,
            endDate,
            datasetId: this.DATASET_ID,
            entity
        } as NewFeature
    }

    public async ingest(filePath: string) {
        await this.upsertDatasource();

        const sourceRecords = JSON.parse(readFileSync(filePath, 'utf-8')) as SourceRecord[]
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