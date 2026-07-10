import { db } from '../../client';
import { sql } from 'drizzle-orm/sql';
import { inferByName, inferByWKT, inferByAdamURI } from './place-inference';
import { Draft } from '../sources/ingestor';

/**
 * Different types of methods for extracting places from objects
 */
export enum PlaceExtractionMethod {
    TEXT,
    WKT,
    URI
}

/**
 * Object used for args for the place-extraction-methods. 
 * Defined as array, when no place it found when a method is executed, 
 * it falls back on the next method defined in array
 * method: type of method used
 * column: from which column should the alg extract data 
 */
export type ExtractionArgs<SourceRecord> = {
  method: PlaceExtractionMethod;
  column: Extract<keyof SourceRecord, string>; 
}[];

export type DateRange = { start: string; end: string };

type InferPlaceArgs = {
    level: string;
    area: string;
    start: string;
    end: string;
};

/**
 * properties of a node. value corresponds to the (partial) name of location.
 * children are the nodes extending the current value. 
 * isTerminal defines if a node is an actual location. 
 * Type corresponds to the type of location (street, address, etc.)
 */
export interface node {
    value?: string
    children: Map<string, node>
    isTerminal: boolean
    type?: string
}

/**
 * Retrieves all existing place-names in database from both places & historic places table
 * @returns map of places and their type (address, street, etc)
 */
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

/**
 * Constructs a trie of places. Starting at root (''), each child correspond to path to an existing place. 
 * We chose to use a trie-object instead of a lookup-table, for efficiency & scaling
 * @param map of existing places (and their types)
 * @returns root-node of trie. can be traversed by following node.children to other nodes
 */
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

/**
 * Checks if provided word exists in one of the children (thus possibly leading to a actual place)
 * @param word 
 * @param node 
 * @returns true or false
 */
function isChild(word: string, node: node) {
    return node.children.has(word)
}

/**
 * Split the text in words. For each words, check if it is a child of the current node (starting at root ('')).
 * If it is, iteratively check if the succeeding word excists as a child in the previously found node.
 * If we end at a terminal-node, we found the words for an existing place
 * @param text to find place in
 * @param root of trie constructed based on available places
 * @returns matches descendingly sorted by length
 */
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

    /**
     * Initializes PlaceIndex. Only construct a trie if TEXT-method is required during extraction
     * @param methods for extracting places
     * @returns PlaceIndex itself
     */
    static async create<SourceRecord extends Record<string, any>>
        (methods: ExtractionArgs<SourceRecord>): Promise<PlaceIndex<SourceRecord>> {
        const index = new PlaceIndex(methods);

        if (methods.some((m) => m.method === PlaceExtractionMethod.TEXT)) {
            await index.initTextIndex();
        }
        
        return index;
    }

    /**
     * Constructs a trie based on the place-map (map of places in database)
     * @returns -
     */
    private async initTextIndex(): Promise<void> {
        if (this.root) return; 

        this.placeMap = await getPlaceMap();
        this.root = constructTrie(this.placeMap);
    }

    /**
     * Tries to extract places from a text using the trie-traverse algorithm. 
     * Then finds to place-name corresponding to the provided time-period
     * @param text 
     * @param dateRange 
     * @returns place_id of match
     */
    async extractFromText(text: string, dateRange: DateRange) {
        const matches = match(text, this.root!)

        if (matches.length <= 0 || !matches[0].value ) { return undefined }

        return await inferByName(JSON.stringify({
            level: matches[0].type,
            area: matches[0].value,
            start: dateRange.start,
            end: dateRange.end,
        } as InferPlaceArgs))
    }
    
    /**
     * Calls the appropriate method for inferring the place based on method. 
     * @param source 
     * @param dateRange 
     * @returns place_id if found
     */
    async extract(source: SourceRecord, dateRange: DateRange) {
        for (const method of this.methods) {
            const value = source[method.column];
            let result: string | undefined = undefined

            switch (method.method) {
                case PlaceExtractionMethod.TEXT:
                    result = await this.extractFromText(value, dateRange)
                    break
                case PlaceExtractionMethod.WKT:
                    result = await inferByWKT(value)
                    break
                case PlaceExtractionMethod.URI:
                    result = await inferByAdamURI(value)
                    break
                default:
                    result = await this.extractFromText(value, dateRange)
                    break
            }

            if (result && result.trim().length > 0) {
                return result
            }
        }
    }
}