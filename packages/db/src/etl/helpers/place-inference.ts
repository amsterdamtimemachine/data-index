import { db } from '../../client';
import { placeHistoricalName } from '../../schema';
import { createCachedResolver } from './helpers';
import { PlaceIdRow } from '../../row-types';
import { SQL, sql } from 'drizzle-orm/sql';

async function fetch<T = string | null>(
    query: SQL, 
    fallback: T = null as T
): Promise<string | T> {
    const result = await db.execute<PlaceIdRow>(query);
    return result.rows[0]?.place_id ?? fallback;
}

export const inferByName = createCachedResolver(async (key: string): Promise<string | undefined> => {
    const { level, area, start, end } = JSON.parse(key) as InferPlaceArgs;
    
    return fetch(sql`
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
    `, undefined); 
})

// TODO: could make {5} in query dynamically
export const inferByWKT = createCachedResolver(async (wkt) => {
    return fetch(sql`
      SELECT p.id as place_id
      FROM place p
      WHERE ST_DWithin(
        p.geometry,
        ST_Transform(ST_GeomFromText(${wkt}, 4326), 28992),
        5 
      )
      ORDER BY p.geometry <-> ST_Transform(ST_GeomFromText(${wkt}, 4326), 28992)
      LIMIT 1
    `);
});

export const resolveByAddress = createCachedResolver(async (adamlinkUri) => {
    return fetch(sql`
        SELECT ${placeHistoricalName.placeId} as place_id 
        FROM ${placeHistoricalName} 
        WHERE ${placeHistoricalName.id} = ${adamlinkUri}
    `);
});

export const resolveByStreet = createCachedResolver(async (streetUri) => {
    return fetch(sql`
        SELECT id as place_id 
        FROM place 
        WHERE id = ${streetUri} AND type = 'street'
    `);
});