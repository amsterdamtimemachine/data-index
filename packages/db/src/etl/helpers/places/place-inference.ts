import { db } from '../../../client';
import { createCachedResolver } from '../helpers';
import { PlaceIdRow } from '../../../row-types';
import { sql } from 'drizzle-orm/sql';

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
 * Fetches the place_id which correspond to the provided name & time-period
 */
export const inferByName = createCachedResolver(async (key: string): Promise<string | undefined> => {
    const { level, area, start, end } = JSON.parse(key);
    
    const result = await db.execute<PlaceIdRow>(sql`
        WITH ${allPlacesCTE}
        SELECT apn.place_id AS place_id
        FROM all_place_names apn
        JOIN place_geometry pg ON pg.place_id = apn.place_id
        WHERE apn.name ILIKE ${area}
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

    return result.rows[0]?.place_id ?? undefined
})

// TODO: could make {5} in query dynamically
/**
 * Fetches place_id based on the provided wkt (geo-object). Tries to find a place within 5 meters of this provided wkt.
 */
export const inferByWKT = createCachedResolver(async (wkt) => {
    const result = await db.execute<PlaceIdRow>(sql`
      SELECT p.place_id as place_id
      FROM place_geometry AS p
      WHERE ST_DWithin(
        p.geometry,
        ST_Transform(ST_GeomFromText(${wkt}, 4326), 28992),
        5 
      )
      ORDER BY p.geometry <-> ST_Transform(ST_GeomFromText(${wkt}, 4326), 28992)
      LIMIT 1
    `);

    return result.rows[0]?.place_id ?? undefined
});

/**
 * Fetches place_id based solely on the provided adamlinkuri
 */
export const inferByAdamURI = createCachedResolver(async (adamlinkUri) => {
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

    return result.rows[0]?.place_id ?? undefined
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