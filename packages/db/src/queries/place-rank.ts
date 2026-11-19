/**
 * A place type's rank in the precision order (PLACE_TYPES, finest first), for the
 * queries that keep or sort by the finest place. One definition, so the feature query
 * and the place search can't order types differently from the resolvers.
 */
import { sql, type SQL } from 'drizzle-orm';
import { PLACE_TYPES } from '@atm/shared';

export function placeTypeRank(type: SQL): SQL {
  // the ranks are inlined: a bound parameter has no type Postgres can give a CASE result
  const whens = PLACE_TYPES.map((t, i) => sql`WHEN ${t} THEN ${sql.raw(String(i))}`);
  return sql`CASE ${type} ${sql.join(whens, sql` `)} ELSE ${sql.raw(String(PLACE_TYPES.length))} END`;
}
