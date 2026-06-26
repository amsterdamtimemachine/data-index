import { db } from '../../client';
import { Draft } from '../sources/ingestor';
import { NewFeature } from '../../schema';
import { createCachedResolver } from './helpers';
import { PlaceIdRow } from '../../row-types';
import { sql } from 'drizzle-orm/sql';


type InferPlaceArgs = {
    level: string;
    area: string;
    start: string;
    end: string;
};

export interface node {
    value?: string
    children: Map<string, node>
    isTerminal: boolean
    type?: string
}

async function getPlaceMap() {
    const allPlaces = await db.execute<{ id: string, name: string, type: string }>(sql`
        SELECT p.id AS place_id,
            p.name AS name,
            p.type AS type
        FROM place p
        WHERE p.name IS NOT NULL

        UNION

        SELECT pn.place_id AS place_id,
            pn.name AS name,
            p.type AS type
        FROM place_historical_name pn
        JOIN place p ON p.id = pn.place_id
        WHERE pn.name IS NOT NULL;
    `);

    const placeMap = new Map<string, string>(
        allPlaces.rows
            .filter(row => row.name != null)
            .map(row => [
                row.name.toLowerCase(),
                row.type
            ])
    );

    return placeMap;
}

function constructTrie(map: Map<string, string>): node {
    const root: node = { value: '', children: new Map(), isTerminal: false};

    for (const place of map) {
        let current: node = root;
        
        const words: string[] = place[0].split(' ')

        for (const word of words) {
            if (!current.children.has(word)) {
                const child: node = {
                    children: new Map(),
                    isTerminal: false,
                }

                current.children.set(word, child)
            }

            current = current.children.get(word)!
        }

        current.value = place[0]
        current.isTerminal = true
        current.type = place[1]
    }

    return root
}

function isChild(word: string, node: node) {
    return node.children.has(word)
}

function match(text: string, root: node): node[] {
    const matches: node[] = []
    const words = text.toLowerCase().split(' ');

    for (let i = 0; i < words.length; i++) {
        let current = root

        for (let j = i; j < words.length; j++) {
            const word = words[j]

            if (!isChild(word, current)) { break }
            current = current.children.get(word)!

            if (current.isTerminal && (j + 1 >= words.length || !current.children.has(words[j + 1]))) {
                matches.push(current)
            }
        }
    }

    return matches.sort((a, b) => b.value!.length - a.value!.length)
}

export class PlaceIndex {
    private constructor(
        private readonly placeMap: Map<string, string>,
        private readonly root: node
    ) {}

    static async create(): Promise<PlaceIndex> {
        const placeMap = await getPlaceMap();
        const root = constructTrie(placeMap);

        return new PlaceIndex(placeMap, root)
    }

    extract(text: string): { area: string; level: string } | undefined {
        const matches = match(text, this.root)

        if (matches.length <= 0 || !matches[0].value ) { return undefined }

        return { 
            area: matches[0].value, 
            level: this.placeMap.get(matches[0].value)!
        }
    }
}


// ------------------------------------------------------------------------------------------------------
// INFERENCE OF PLACE 
// ------------------------------------------------------------------------------------------------------
const inferPlaceIdCached = createCachedResolver(async (key: string) => {
    const { level, area, start, end } = JSON.parse(key) as InferPlaceArgs;
    const result = await db.execute<PlaceIdRow>(sql`
        SELECT p.id AS place_id
        FROM place p
        JOIN place_geometry pg ON pg.place_id = p.id
        WHERE p.name ILIKE ${area}
        AND (
            (pg.since IS NULL AND pg.until IS NULL)
            OR (
                pg.since <= ${end}::date
                AND (pg.until IS NULL OR pg.until > ${start}::date)
            )
        )
        ORDER BY GREATEST(
                    0,
                    LEAST(${end}::date, COALESCE(pg.until, 'infinity'::date))
                    - GREATEST(${start}::date, pg.since)
                ) DESC,
                pg.since DESC
        LIMIT 1
    `);

    return result.rows[0]?.place_id ?? null;
});

export async function inferPlaceId(target: Draft, place: { area: string; level: string }) {
    const { startDate: date_start, endDate: date_end } = target;
    const start = date_start;
    const end = date_end || date_start;
    const level = place.level
    const area = place.area

    const key = JSON.stringify({ level, area, start, end });

    return inferPlaceIdCached(key);
}