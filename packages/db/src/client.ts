import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool, type PoolConfig } from 'pg';
import * as schema from './schema';

const config: PoolConfig = process.env.DATABASE_URL
  ? { connectionString: process.env.DATABASE_URL }
  : {
      host: process.env.DB_HOST ?? 'localhost',
      port: parseInt(process.env.DB_PORT ?? '5432'),
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
    };

const pool = new Pool(config);

/**
 * Drizzle client.
 *
 * Convention: use the Drizzle query builder (db.select / insert / update) for
 * plain CRUD. Many read paths here are spatial or analytical and rely on things
 * the builder cannot express — PostGIS functions (ST_GeomFromText, ST_Transform,
 * ST_DWithin, the <-> KNN operator), window functions, generate_series time
 * binning, and COUNT(DISTINCT) over computed groupings. Those are written as raw
 * `sql` via db.execute on purpose, not as a shortcut. Geometry inserts still use
 * the builder, passing only the ST_* column value as a `sql` expression.
 */
export const db = drizzle(pool, { schema });
