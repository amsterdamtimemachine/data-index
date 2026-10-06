import { CreativeWorkEntity, EntityBase, MediaObjectEntity, PersonEntity, ScreeningEventEntity, MovieEntity, VenueEntity, RecordType } from "@atm/shared";
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

// the source row's shape, as the cinema-context source reads it
type ScreeningVenue = { perm_id?: string; url?: string; name?: string; type?: string; schema_type?: string; address?: string };
type ScreeningItem = { title?: string; url?: string; year?: string; country?: string; director?: string; production_company?: string; live?: string };

export class ScreeningEventEntityFactory extends EntityFactory<ScreeningEventEntity> {
    create(feature: Draft, data: Map<string, unknown>): ScreeningEventEntity {
        const venue = (data.get('venue') ?? {}) as ScreeningVenue;
        const items = (data.get('items') ?? []) as ScreeningItem[];
        const sources = (data.get('sources') ?? []) as string[];
        const programmeTitle = data.get('programme_title');
        const date = data.get('date');
        const permId = data.get('perm_id');

        const films: MovieEntity[] = [];
        const acts: string[] = [];
        for (const item of items) {
            if (item.live) {
                acts.push(item.live);
            }
            if (!item.title) {
                continue;
            }
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

        return {
            type: 'ScreeningEvent',
            ...(typeof permId === 'string' && { id: permId }),
            name: feature.label,
            ...(typeof programmeTitle === 'string' && { alternateName: programmeTitle }),
            startDate: typeof date === 'string' ? date.replace(/-xx$/, '').replace(/-xx-xx$/, '') : feature.startDate,
            location: {
                type: venueType(venue.schema_type),
                name: venue.name ?? '',
                identifier: venue.perm_id ?? '',
                ...(venue.type && { additionalType: venue.type }),
                ...(venue.address && { address: venue.address }),
                ...(venue.url && { url: venue.url }),
            },
            workPresented: films,
            ...(acts.length > 0 && { performer: acts.join('; ') }),
            ...(sources.length > 0 && { citation: sources }),
        };
    }
}
// the export names the venue's Schema.org type; anything else is a hall of unknown kind
const VENUE_TYPES: VenueEntity['type'][] = ['MovieTheater', 'PerformingArtsTheater', 'EventVenue'];
function venueType(named: string | undefined): VenueEntity['type'] {
    const known = VENUE_TYPES.find((t) => t === named);
    if (known) {
        return known;
    }
    return 'EventVenue';
}

const FACTORY_MAP: Record<RecordType, (new () => EntityFactory<EntityBase>) | null> = {
  image: MediaObjectEntityFactory,
  text: CreativeWorkEntityFactory,
  person: PersonEntityFactory,
  // events have no default shape: each event source names its own factory (see Ingestor.entityFactory)
  event: null,
  unknown: null,
};

export function createEntityFactory(type: RecordType): EntityFactory<EntityBase> {
    const FactoryClass = FACTORY_MAP[type]

    if (!FactoryClass) { throw new Error(`EntityType ${type}'s factory not found`)}

    return new FactoryClass()
}