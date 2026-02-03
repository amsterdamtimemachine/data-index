import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

// Raw pool for optimized spatial/histogram queries
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

// Drizzle client for ORM queries
export const db = drizzle(pool, { schema });
