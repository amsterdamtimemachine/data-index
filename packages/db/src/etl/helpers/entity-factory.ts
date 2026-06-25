import { CreativeWorkEntity, EntityBase, MediaObjectEntity, PersonEntity } from "@atm/shared";
import { formatDateRange } from "./helpers";
import { NewFeature } from "../../schema";

export enum recordType {
    IMAGE = 'image',
    TEXT = 'text',
    PERSON = 'person'
}

export abstract class EntityFactory<T extends EntityBase> {
    abstract create(feature: NewFeature, data: Map<string, any>): T
}

export class PersonEntityFactory extends EntityFactory<PersonEntity> {
    create(feature: NewFeature, data: Map<string, any>): PersonEntity {
      return {
        type: 'Person',
        name: feature.label,
        ...(data.get('birthDate') && { birthDate: data.get('birthDate') }),
        ...(data.get('birthPlace') && { birthPlace: data.get('birthPlace') }),
        ...(data.get('deathDate') && { deathDate: data.get('deathDate') }),
        ...(data.get('deathPlace') && { deathPlace: data.get('deathPlace') })
      } as PersonEntity
    }
}

export class CreativeWorkEntityFactory extends EntityFactory<CreativeWorkEntity> {
    create(feature: NewFeature, data: Map<string, any>): CreativeWorkEntity {
        const dateCreated = formatDateRange(feature.startDate!, feature.endDate!);

        return {
            type: 'CreativeWork',
            name: feature.label,
            url: feature.url,
            ...(dateCreated && { dateCreated })
        } as CreativeWorkEntity;
    }
}

export class MediaObjectEntityFactory extends EntityFactory<MediaObjectEntity> {
    create(feature: NewFeature, data: Map<string, any>): MediaObjectEntity {
        const dateCreatedFormatted = formatDateRange(feature.startDate!, feature.endDate!);

        return {
            type: 'MediaObject',
            name: feature.label,
            contentUrl: feature.contentUrl!,
            ...(dateCreatedFormatted && { dateCreated: dateCreatedFormatted })
        };
    } 
}


export function createEntityFactory(type: recordType): EntityFactory<EntityBase> {
    switch (type) {
        case recordType.IMAGE:  return new MediaObjectEntityFactory();
        case recordType.PERSON: return new PersonEntityFactory();
        case recordType.TEXT:   return new CreativeWorkEntityFactory();
    }
}