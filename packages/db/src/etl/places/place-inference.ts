import { db } from '../../client';
import { createCachedResolver } from './cache';
import { PlaceIdRow } from '../../row-types';
import { sql } from 'drizzle-orm/sql';
import { getCandidatesByPoint, getCandidatesByName, getNamesForPlaces, pickFinest, resolveNamePool, twinOf, type Candidate, type PlaceType } from './place-candidates';
import { confirmByText } from './place-confirm';
import type { Resolved } from './place-index';

const allPlacesCTE = sql`
    SELECT LOWER(p.name) AS name, p.type AS type
    FROM place p
    WHERE p.name IS NOT NULL

    UNION

    SELECT LOWER(pn.name) AS name, p.type AS type
    FROM place_historical_name pn
    JOIN place p ON p.id = pn.place_id
    WHERE pn.name IS NOT NULL
      AND (pn.since IS NOT NULL OR pn.until IS NOT NULL);
`

const twins = createCachedResolver(async (key: string) => {
    const { placeId, start, end } = JSON.parse(key);
    return twinOf(placeId, start, end);
});

// An address matched outside its register's era moves to the same address as the other
// source records it. Among several twins, those that share one of the place's names
// (the same street, not another street in the building), then those nearest the
// feature date (the register closest in time); the match stands unless one is left,
// being the only evidence there is. Streets and areas have no register split.
async function eraTwin(placeId: string, type: PlaceType, eraFit: boolean, start: string, end: string): Promise<string> {
    if (type !== 'address' || eraFit) { return placeId }
    let found = await twins(JSON.stringify({ placeId, start, end }));
    const named = found.filter((t) => t.sharesName);
    if (named.length > 0) { found = named }
    if (found.length > 1) {
        const nearest = Math.min(...found.map((t) => t.gapDays ?? Infinity));
        found = found.filter((t) => (t.gapDays ?? Infinity) === nearest);
    }
    if (found.length === 1) { return found[0].placeId }
    return placeId;
}

/**
 * Resolve a place-name string to the single place it names — exact case-insensitive
 * match (LOWER(name) =), nearest-in-time by the feature date range, unique winner by
 * gap → finest type; an address outside its era yields to its twin (eraTwin). Returns a tagged skip (→ the cascade tries the next method, else
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
    if (r.kind === 'resolved') { return { placeId: await eraTwin(r.winner.placeId, r.winner.type, r.winner.eraFit, start, end) } }
    if (r.kind === 'ambiguous') { return { skip: 'ambiguous' } }
    return { skip: 'no-match' };
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
    if (!best) { return { skip: 'cap-miss' } }
    return { placeId: await eraTwin(best.placeId, best.type, best.eraFit, start, end) };
});

const pointPool = createCachedResolver(async (key: string): Promise<Candidate[]> => {
    const { wkt, start, end } = JSON.parse(key);
    return getCandidatesByPoint(wkt, start, end);
});

/** The point cascade, with the feature's text deciding between neighbours it names. */
export async function inferByPointConfirmed(wkt: string, text: string, start: string, end: string): Promise<Resolved> {
    if (!wkt) { return { skip: 'no-match' } }
    if (!start || !end) { return { skip: 'undated' } }
    const pool = await pointPool(JSON.stringify({ wkt, start, end }));
    const named = pool.filter((c) => c.type === 'address' || c.type === 'street').map((c) => c.placeId);
    const names = await getNamesForPlaces(named);
    const best = pickFinest(confirmByText(pool, names, text));
    if (!best) { return { skip: 'cap-miss' } }
    return { placeId: await eraTwin(best.placeId, best.type, best.eraFit, start, end) };
}

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
    if (!id) { return { skip: 'no-match' } }
    return { placeId: id };
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