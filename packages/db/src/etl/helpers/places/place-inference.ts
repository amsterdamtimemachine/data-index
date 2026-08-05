import { db } from '../../../client';
import { createCachedResolver } from '../helpers';
import { PlaceIdRow } from '../../../row-types';
import { sql } from 'drizzle-orm/sql';
import { getCandidatesByPoint, getCandidatesByName, pickFinest, resolveNamePool } from './place-candidates';
import type { Resolved } from './place-index';

const allPlacesCTE = sql`
    SELECT LOWER(p.name) AS name, p.type AS type
    FROM place p
    WHERE p.name IS NOT NULL

    UNION

    SELECT LOWER(pn.name) AS name, p.type AS type
    FROM place_historical_name pn
    JOIN place p ON p.id = pn.place_id
    WHERE pn.name IS NOT NULL;
`

/**
 * Resolve a place-name string to the single place it names — exact case-insensitive
 * match (LOWER(name) =), nearest-in-time by the feature date range, unique winner by
 * gap → finest type. Returns a tagged skip (→ the cascade tries the next method, else
 * the feature is skipped): 'no-match' when the name matches nothing (or is empty),
 * 'ambiguous' for two equal-gap same-type places, 'undated' when the feature has no date.
 * Cache key is JSON `{area, start, end}` — the trie's type is NOT a filter (a
 * name-collision map makes it unreliable; resolveNamePool's finest-type tiebreak decides).
 * NB: `%`/`_` in a name are now literal, not wildcards (was ILIKE) — flag for the co-dev.
 */
export const inferByName = createCachedResolver(async (key: string): Promise<Resolved> => {
    const { area, start, end } = JSON.parse(key);
    if (!area) { return { skip: 'no-match' } }
    if (!start || !end) { return { skip: 'undated' } }
    const r = resolveNamePool(await getCandidatesByName(area, start, end));
    if (r.kind === 'resolved') { return { placeId: r.winner.placeId } }
    return { skip: r.kind === 'ambiguous' ? 'ambiguous' : 'no-match' };
})

/**
 * Resolve a point WKT (WGS84) to the single most-specific place — nearest address
 * (≤30m) / street (≤50m) per source, else the containing area — era-ranked by the
 * feature date range. Returns a tagged skip (→ the cascade tries the next method, else
 * the feature is skipped): 'cap-miss' when nothing sits within the caps, 'undated' when
 * the feature has no date (a point can't be era-placed without one; spec §5), 'no-match'
 * when no coordinate was given. Cache key is JSON `{wkt, start, end}`.
 */
export const inferByPoint = createCachedResolver(async (key: string): Promise<Resolved> => {
    const { wkt, start, end } = JSON.parse(key);
    if (!wkt) { return { skip: 'no-match' } }
    if (!start || !end) { return { skip: 'undated' } }
    const best = pickFinest(await getCandidatesByPoint(wkt, start, end));
    return best ? { placeId: best.placeId } : { skip: 'cap-miss' };
});

/**
 * Fetches place_id based solely on the provided adamlinkuri
 */
export const inferByAdamURI = createCachedResolver(async (adamlinkUri: string): Promise<Resolved> => {
    const result = await db.execute<PlaceIdRow>(sql`
        SELECT p.id AS place_id,
            p.name AS name
        FROM place p
        WHERE p.name IS NOT NULL AND
            p.id = ${adamlinkUri}

        UNION

        SELECT pn.place_id AS place_id,
            pn.name AS name
        FROM place_historical_name pn
        WHERE pn.name IS NOT NULL AND
            pn.id = ${adamlinkUri}
    `);

    const id = result.rows[0]?.place_id;
    return id ? { placeId: id } : { skip: 'no-match' };
});

/**
 * Retrieves all existing place-names in database from both places & historic places table
 * @returns map of places and their type (address, street, etc)
 */
export async function getPlaceMap() {
    const results = await db.execute<{ id: string, name: string, type: string }>(allPlacesCTE);

    const placeMap = new Map<string, string>();

    for (const row of results.rows) {
        if (row.name) {
            placeMap.set(row.name, row.type);
        }
    }

    return placeMap;
}