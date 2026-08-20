/**
 * Named SQL fragments for the ETL layer — the arithmetic and predicates the index
 * build repeats across queries. Each has exactly one definition so call sites can't
 * drift apart (see queries/time-filter.ts for the query-layer precedent and the
 * drift story that motivated it).
 */
import { sql, type SQL } from 'drizzle-orm';
import { PRECOMP_TIME_BIN_YEARS, PRECOMP_GRID_CELL_METERS } from '@atm/shared';

/**
 * WKT → stored RD/28992 geometry. RD input is inserted as-is; any other SRID is
 * transformed. One definition for both the place writers and the point resolver,
 * so read and write sides normalise identically.
 */
export function wktToRd(wkt: string, srid: number): SQL {
  return srid === 28992
    ? sql`ST_GeomFromText(${wkt}, 28992)`
    : sql`ST_Transform(ST_GeomFromText(${wkt}, ${srid}), 28992)`;
}

/**
 * Floor a date's year onto the base time-bin grid (multiples of
 * PRECOMP_TIME_BIN_YEARS) — the binning cell_features is built on, and the unit
 * temporal_frequency counts in. generateTimeSlices (JS) mirrors this anchoring.
 */
export function yearBin(dateCol: SQL): SQL {
  return sql`(FLOOR(EXTRACT(YEAR FROM ${dateCol}) / ${PRECOMP_TIME_BIN_YEARS}::int) * ${PRECOMP_TIME_BIN_YEARS}::int)::int`;
}

/**
 * Grid-cell index of an RD coordinate on the base grid anchored at `origin`
 * (metres). Uncast — call sites append ::int / ::smallint as their column needs.
 */
export function cellIndex(coordExpr: SQL, origin: number): SQL {
  return sql`FLOOR((${coordExpr} - ${origin}::float8) / ${PRECOMP_GRID_CELL_METERS}::float8)`;
}

/** The RD envelope of grid cell (gx, gy) — the inverse of cellIndex, for intersect-fill. */
export function cellEnvelope(gx: SQL, gy: SQL, originX: number, originY: number): SQL {
  return sql`ST_MakeEnvelope(
    ${originX}::float8 + ${gx} * ${PRECOMP_GRID_CELL_METERS}::float8,
    ${originY}::float8 + ${gy} * ${PRECOMP_GRID_CELL_METERS}::float8,
    ${originX}::float8 + (${gx} + 1) * ${PRECOMP_GRID_CELL_METERS}::float8,
    ${originY}::float8 + (${gy} + 1) * ${PRECOMP_GRID_CELL_METERS}::float8,
    28992
  )`;
}
