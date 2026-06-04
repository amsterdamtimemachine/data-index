/**
 * Small shared shapes for db.execute<T>() result rows that recur across the
 * query, ETL and test layers. (Postgres returns COUNT/text columns as strings.)
 */

/** A `SELECT ... AS place_id` row — used by every place-resolution lookup. */
export type PlaceIdRow = { place_id: string };

/** A `SELECT COUNT(*) AS count` row. */
export type CountRow = { count: string };
