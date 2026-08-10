import { CreativeWorkEntity, EntityBase, MediaObjectEntity, PersonEntity, RecordType } from "@atm/shared";
import { formatDateRange } from "../util/dates";
import { Draft } from "./ingestor";

export abstract class EntityFactory<T extends EntityBase> {
    abstract create(feature: Draft, data: Map<string, unknown>): T
}

export class PersonEntityFactory extends EntityFactory<PersonEntity> {
    create(feature: Draft, data: Map<string, unknown>): PersonEntity {
        const birthDate = data.get('birthDate');
        const birthPlace = data.get('birthPlace');
        const deathDate = data.get('deathDate');
        const deathPlace = data.get('deathPlace');

        return {
            type: 'Person',
            name: feature.label,
            ...(typeof birthDate === 'string' && { birthDate }),
            ...(typeof birthPlace === 'string' && { birthPlace }),
            ...(typeof deathDate === 'string' && { deathDate }),
            ...(typeof deathPlace === 'string' && { deathPlace }),
        } as PersonEntity;
    }
}

export class CreativeWorkEntityFactory extends EntityFactory<CreativeWorkEntity> {
    create(feature: Draft, data: Map<string, unknown>): CreativeWorkEntity {
        const dateCreated = formatDateRange(feature.startDate, feature.endDate);

        return {
            type: 'CreativeWork',
            name: feature.label,
            url: feature.url,
            ...(dateCreated && { dateCreated })
        } as CreativeWorkEntity;
    }
}

export class MediaObjectEntityFactory extends EntityFactory<MediaObjectEntity> {
    create(feature: Draft, data: Map<string, unknown>): MediaObjectEntity {
        const dateCreatedFormatted = formatDateRange(feature.startDate, feature.endDate);

        return {
            type: 'MediaObject',
            name: feature.label,
            contentUrl: feature.contentUrl!,
            ...(dateCreatedFormatted && { dateCreated: dateCreatedFormatted })
        };
    } 
}

const FACTORY_MAP: Record<RecordType, (new () => EntityFactory<EntityBase>) | null> = {
  image: MediaObjectEntityFactory,
  text: CreativeWorkEntityFactory,
  person: PersonEntityFactory,
  unknown: null,
};

export function createEntityFactory(type: RecordType): EntityFactory<EntityBase> {
    const FactoryClass = FACTORY_MAP[type]

    if (!FactoryClass) { throw new Error(`EntityType ${type}'s factory not found`)}

    return new FactoryClass()
}