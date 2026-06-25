import { is, sql } from 'drizzle-orm';
import { db } from '../../client';
import { writeFileSync } from "fs";
import { Draft, DraftRecord } from '../sources/ingestor';
import { NewFeature } from '../../schema';
import { createCachedResolver } from './helpers';
import { PlaceIdRow } from '../../row-types';


type InferPlaceArgs = {
    level: string;
    area: string;
    start: string;
    end: string;
};

export interface node {
    value: string
    children: Map<string, node>
    isTerminal: boolean
    type?: string
}

async function getPlaceMap() {
    const allPlaces = await db.execute<{ id: string, name: string, type: string }>(sql`
        SELECT p.id AS place_id,
            p.preferred_label AS name,
            p.type AS type
        FROM place p
        WHERE p.preferred_label IS NOT NULL

        UNION

        SELECT pn.place_id AS place_id,
            pn.name AS name,
            p.type AS type
        FROM place_name pn
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
                    value: word,
                    children: new Map(),
                    isTerminal: false,
                }

                current.children.set(word, child)
            }

            current = current.children.get(word)!
        }

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

            if (current.isTerminal && 
                (j + 1 <= words.length && !current.children.has(words[j + 1]))) {
                matches.push(current)
            }
        }
    }

    return matches.sort((a, b) => b.value.length - a.value.length)
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

        if (!matches || matches.length <= 0) { return undefined }

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

export async function inferPlaceId(target: Draft<NewFeature>, place: { area: string; level: string }) {
    const { startDate: date_start, endDate: date_end } = target;
    const start = date_start;
    const end = date_end || date_start;
    const level = place.level
    const area = place.area

    const key = JSON.stringify({ level, area, start, end });

    return inferPlaceIdCached(key);
}