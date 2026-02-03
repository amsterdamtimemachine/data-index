// Schema exports
export * from './schema';

// Client exports
export { db, pool } from './client';

// Query exports
export * from './queries';

// Re-export Pool type for convenience
export { Pool } from 'pg';
