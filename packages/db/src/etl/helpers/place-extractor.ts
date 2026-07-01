import { db } from '../../client';
import { sql } from 'drizzle-orm/sql';
import { inferByName, inferByWKT, inferByAdamURI } from './place-inference';

export enum PlaceExtractionMethod {
    TEXT,
    WKT,
    URI
}

export type ExtractionArgs<SourceRecord> = {
  method: PlaceExtractionMethod;
  column: Extract<keyof SourceRecord, string>; 
}[];

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

export class PlaceIndex<SourceRecord extends Record<string, any>> {
    private constructor(
        private readonly methods: ExtractionArgs<SourceRecord>,
        private placeMap?: Map<string, string>,
        private root?: node
    ) {}

    static async create<SourceRecord extends Record<string, any>>
        (methods: ExtractionArgs<SourceRecord>): Promise<PlaceIndex<SourceRecord>> {
        const index = new PlaceIndex(methods);

        if (methods.some((m) => m.method === PlaceExtractionMethod.TEXT)) {
            await index.initTextIndex();
        }
        
        return index;
    }

    private async initTextIndex(): Promise<void> {
        if (this.root) return; 

        this.placeMap = await getPlaceMap();
        this.root = constructTrie(this.placeMap);
    }

    async extractFromText(source: SourceRecord, text: string) {
        const matches = match(text, this.root!)

        if (matches.length <= 0 || !matches[0].value ) { return undefined }

        return await inferByName(JSON.stringify({
            level: matches[0].type,
            area: matches[0].value,
            start: source.startDate,
            end: source.endDate ? source.endDate : source.startDate,
        } as InferPlaceArgs))
    }

    async extract(source: SourceRecord) {
        for (const method of this.methods) {
            const value = source[method.column];
            let result: string | undefined = undefined

            switch (method.method) {
                case PlaceExtractionMethod.TEXT:
                    result = await this.extractFromText(source, value)
                    break
                case PlaceExtractionMethod.WKT:
                    result = await inferByWKT(value)
                    break
                case PlaceExtractionMethod.URI:
                    result = await inferByAdamURI(value)
                    break
                default:
                    result = await this.extractFromText(source, value)
                    break
            }

            if (result) {
                return result
            }
        }
    }
}