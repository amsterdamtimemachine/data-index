import { PlaceTrie } from "./place-trie";
import { getPlaceMap, inferByAdamURI, inferByName, inferByPoint } from "./place-inference";

/**
 * Different types of methods for extracting places from objects
 */
export enum PlaceExtractionMethod { TEXT, WKT, URI }

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

// A resolver / extract outcome: a linked place, or a skip tagged with WHY (feeds the
// per-reason ingest tally). When a cascade fails across methods, keep the most
// actionable reason by this precedence: ambiguous > cap-miss > undated > no-match.
export type SkipReason = 'ambiguous' | 'cap-miss' | 'undated' | 'no-match';
export type Resolved = { placeId: string } | { skip: SkipReason };

const SKIP_PRECEDENCE: SkipReason[] = ['ambiguous', 'cap-miss', 'undated', 'no-match'];
const moreSpecificSkip = (a: SkipReason | undefined, b: SkipReason): SkipReason =>
    a !== undefined && SKIP_PRECEDENCE.indexOf(a) <= SKIP_PRECEDENCE.indexOf(b) ? a : b;

type InferPlaceArgs = {
    area: string;
    start: string;
    end: string;
};

export class PlaceIndex<SourceRecord extends Record<string, any>> {
    private placeTrie: PlaceTrie | undefined = undefined

    private constructor(
        private readonly methods: ExtractionArgs<SourceRecord>,
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
            await index.initPlaceTrie();
        }
        
        return index;
    }

    /**
     * Constructs a trie based on the place-map (map of places in database)
     * @returns -
     */
    private async initPlaceTrie(): Promise<PlaceTrie> {
        const placeMap = await getPlaceMap();

        this.placeTrie = new PlaceTrie(placeMap)
        return this.placeTrie
    }

    /**
     * Tries to extract places from a text using the trie-traverse algorithm. 
     * Then finds to place-name corresponding to the provided time-period
     * @param text 
     * @param dateRange 
     * @returns place_id of match
     */
    async extractFromText(text: string, dateRange: DateRange): Promise<Resolved> {
        if (!this.placeTrie) { this.placeTrie = await this.initPlaceTrie() }

        const matches = this.placeTrie.match(text)

        if (matches.length <= 0 || !matches[0].value ) { return { skip: 'no-match' } }

        return await inferByName(JSON.stringify({
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
    async extract(source: SourceRecord, dateRange: DateRange): Promise<Resolved> {
        let skip: SkipReason | undefined = undefined

        for (const method of this.methods) {
            const value = String(source[method.column] ?? '').trim()
            if (!value) { continue }

            let res: Resolved

            switch (method.method) {
                case PlaceExtractionMethod.WKT:
                    res = await inferByPoint(JSON.stringify({ wkt: value, start: dateRange.start, end: dateRange.end }))
                    break
                case PlaceExtractionMethod.URI:
                    res = await inferByAdamURI(value)
                    break
                case PlaceExtractionMethod.TEXT:
                default:
                    res = await this.extractFromText(value, dateRange)
                    break
            }

            if ('placeId' in res) { return res }
            skip = moreSpecificSkip(skip, res.skip)
        }

        // no method produced a value at all → no-match; else the most actionable skip
        return { skip: skip ?? 'no-match' }
    }
}