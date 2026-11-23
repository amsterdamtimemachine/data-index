import { CreativeWorkEntity, EntityBase, MediaObjectEntity, PersonEntity, ScreeningEventEntity, MovieEntity, ManuscriptEntity, Excerpt, RecordType, parsePartialDate, formatIsoDate } from "@atm/shared";
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
    create(feature: Draft): CreativeWorkEntity {
        // a text's date is the issue it was published in
        const datePublished = formatDateRange(feature.startDate, feature.endDate);

        return {
            type: 'CreativeWork',
            name: feature.label,
            url: feature.url,
            ...(datePublished && { datePublished })
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
type ProgrammeVenue = { perm_id?: string; url?: string; name?: string; type?: string };
// a live act comes as an item without a title, and is left out
export type SourceItem = { title?: string; url?: string; year?: string; country?: string; director?: string; production_company?: string };

/**
 * A programme's films in the source's order. Live acts are left out: the index keeps
 * Cinema Context's screenings, and a programme without a film is not ingested.
 */
function programmeFilms(items: SourceItem[]): MovieEntity[] {
    const films: MovieEntity[] = [];
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
    }
    return films;
}

/** A programme as a screening, with its films as its items. */
export class ProgrammeEntityFactory extends EntityFactory<ScreeningEventEntity> {
    create(feature: Draft, data: Map<string, unknown>): ScreeningEventEntity {
        const venue = (data.get('venue') ?? {}) as ProgrammeVenue;
        const address = data.get('address');
        const date = data.get('date');
        const permId = data.get('perm_id');
        const items = programmeFilms((data.get('items') ?? []) as SourceItem[]);

        // the source's own precision, with its xx placeholders dropped
        let startDate = feature.startDate;
        if (typeof date === 'string') {
            const parsed = parsePartialDate(date);
            if (parsed) {
                startDate = formatIsoDate(parsed);
            }
        }

        return {
            type: 'ScreeningEvent',
            ...(typeof permId === 'string' && { id: permId }),
            name: feature.label,
            startDate,
            location: {
                type: 'Place',
                name: venue.name ?? '',
                identifier: venue.perm_id ?? '',
                ...(venue.url && { url: venue.url }),
                ...(venue.type && { additionalType: venue.type }),
                ...(typeof address === 'string' && address && { address }),
            },
            items,
        };
    }
}

// the source row's shape, as the amsterdam-diaries source reads it
type DiaryRef = { name?: string; url?: string };
type DiaryAuthor = { name?: string; url?: string };

export class ManuscriptEntityFactory extends EntityFactory<ManuscriptEntity> {
    create(feature: Draft, data: Map<string, unknown>): ManuscriptEntity {
        const diary = (data.get('diary') ?? {}) as DiaryRef;
        const author = (data.get('author') ?? {}) as DiaryAuthor;
        const name = data.get('name');
        const date = data.get('date');
        const excerpts = (data.get('excerpts') ?? []) as Excerpt[];

        return {
            type: 'Manuscript',
            id: feature.id,
            name: typeof name === 'string' && name ? name : feature.label,
            ...(typeof date === 'string' && date && { dateCreated: date }),
            // only the excerpt's own fields: the source row's place URI is the ingest's key, not the entity's
            excerpts: excerpts.map((x) => ({
                text: x.text, truncatedBefore: x.truncatedBefore, truncatedAfter: x.truncatedAfter, mentions: x.mentions,
                ...(x.images?.length && { images: x.images }),
            })),
            ...(author.name && { author: { type: 'Person' as const, name: author.name, ...(author.url && { url: author.url }) } }),
            ...(diary.name && {
                isPartOf: {
                    type: 'Book' as const,
                    name: diary.name,
                    ...(diary.url && { url: diary.url }),
                },
            }),
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