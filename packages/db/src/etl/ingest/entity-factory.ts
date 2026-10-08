import { CreativeWorkEntity, EntityBase, MediaObjectEntity, PersonEntity, ScreeningEventEntity, TheaterEventEntity, MovieEntity, ManuscriptEntity, MentionEntity, RecordType } from "@atm/shared";
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
        const textDate = data.get('textDate');
        let dateText: string | undefined;
        if (typeof textDate === 'string' && textDate.trim()) {
            dateText = textDate.trim();
        }

        return {
            type: 'MediaObject',
            name: feature.label,
            contentUrl: feature.contentUrl!,
            ...(dateCreatedFormatted && { dateCreated: dateCreatedFormatted }),
            ...(dateText && { dateText }),
        };
    } 
}

// the source row's shape, as the cinema-context source reads it
type ProgrammeVenue = { perm_id?: string; name?: string; type?: string };
export type ProgrammeItem = { title?: string; url?: string; year?: string; country?: string; director?: string; production_company?: string; live?: string };

/** A programme's bill split into its films and its live acts, each in bill order. */
export function programmeBill(items: ProgrammeItem[]): { films: MovieEntity[]; acts: string[] } {
    const films: MovieEntity[] = [];
    const acts: string[] = [];
    for (const item of items) {
        if (item.title) {
            films.push({
                type: 'Movie',
                name: item.title,
                ...(item.url && { url: item.url }),
                ...(item.year && { dateCreated: item.year }),
                ...(item.country && { countryOfOrigin: item.country }),
                ...(item.director && { director: item.director }),
                ...(item.production_company && { productionCompany: item.production_company }),
            });
        }
        if (item.live) {
            acts.push(item.live);
        }
    }
    return { films, acts };
}

/** A programme: a ScreeningEvent when its bill has a film, a TheaterEvent when it has acts only. */
export class ProgrammeEntityFactory extends EntityFactory<ScreeningEventEntity | TheaterEventEntity> {
    create(feature: Draft, data: Map<string, unknown>): ScreeningEventEntity | TheaterEventEntity {
        const venue = (data.get('venue') ?? {}) as ProgrammeVenue;
        const address = data.get('address');
        const sources = (data.get('sources') ?? []) as string[];
        const date = data.get('date');
        const permId = data.get('perm_id');
        const { films, acts } = programmeBill((data.get('items') ?? []) as ProgrammeItem[]);

        let type: 'ScreeningEvent' | 'TheaterEvent' = 'TheaterEvent';
        if (films.length > 0) {
            type = 'ScreeningEvent';
        }
        let startDate = feature.startDate;
        if (typeof date === 'string') {
            startDate = date.replace(/-xx-xx$/, '').replace(/-xx$/, '');
        }

        return {
            type,
            ...(typeof permId === 'string' && { id: permId }),
            name: feature.label,
            startDate,
            location: {
                type: 'Place',
                name: venue.name ?? '',
                identifier: venue.perm_id ?? '',
                ...(venue.type && { additionalType: venue.type }),
                ...(typeof address === 'string' && address && { address }),
            },
            workPresented: films,
            ...(acts.length > 0 && { performer: acts }),
            ...(sources.length > 0 && { citation: sources }),
        };
    }
}

// the source row's shape, as the amsterdam-diaries source reads it
type DiaryRef = { name?: string; url?: string; coverage?: string };
type DiaryAuthor = { name?: string; url?: string };

export class ManuscriptEntityFactory extends EntityFactory<ManuscriptEntity> {
    create(feature: Draft, data: Map<string, unknown>): ManuscriptEntity {
        const diary = (data.get('diary') ?? {}) as DiaryRef;
        const author = (data.get('author') ?? {}) as DiaryAuthor;
        const mentions = (data.get('mentions') ?? []) as MentionEntity[];
        const name = data.get('name');
        const date = data.get('date');
        const text = data.get('text');

        return {
            type: 'Manuscript',
            id: feature.id,
            name: typeof name === 'string' && name ? name : feature.label,
            ...(typeof date === 'string' && date && { dateCreated: date }),
            text: typeof text === 'string' ? text : '',
            ...(author.name && { author: { type: 'Person' as const, name: author.name, ...(author.url && { url: author.url }) } }),
            ...(diary.name && {
                isPartOf: {
                    type: 'Book' as const,
                    name: diary.name,
                    ...(diary.url && { url: diary.url }),
                    ...(diary.coverage && { temporalCoverage: diary.coverage }),
                },
            }),
            mentions: mentions.map((m) => ({ type: m.type, name: m.name, ...(m.url && { url: m.url }) })),
        };
    }
}

const FACTORY_MAP: Record<RecordType, (new () => EntityFactory<EntityBase>) | null> = {
  image: MediaObjectEntityFactory,
  text: CreativeWorkEntityFactory,
  person: PersonEntityFactory,
  // events and stories have no default shape: each such source names its own factory (see Ingestor.entityFactory)
  event: null,
  story: null,
  unknown: null,
};

export function createEntityFactory(type: RecordType): EntityFactory<EntityBase> {
    const FactoryClass = FACTORY_MAP[type]

    if (!FactoryClass) { throw new Error(`EntityType ${type}'s factory not found`)}

    return new FactoryClass()
}