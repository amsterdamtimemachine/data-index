import { PlaceTrie } from "./place-trie";
import { getPlaceMap, inferByAdamURI, inferByName, inferByWKT } from "./place-inference";

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

type InferPlaceArgs = {
    level: string;
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
    async extractFromText(text: string, dateRange: DateRange) {
        if (!this.placeTrie) { this.placeTrie = await this.initPlaceTrie() }

        const matches = this.placeTrie.match(text)

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
            const value = String(source[method.column] ?? '').trim()
            if (!value) { continue }

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