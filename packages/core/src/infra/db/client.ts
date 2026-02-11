import mysql from 'mysql2/promise';

import { drizzle } from 'drizzle-orm/mysql2';

import { getEnv } from '../../config/env.js';
import * as schema from './schema/index.js';

let pool: mysql.Pool | null = null;

function getPool(): mysql.Pool {
  if (!pool) {
    const env = getEnv();
    pool = mysql.createPool({
      uri: env.DATABASE_URL,
      connectionLimit: 10,
      namedPlaceholders: true,
      supportBigNumbers: true,
    });
  }

  return pool;
}

export function getDb() {
  return drizzle({
    client: getPool(),
    schema,
    mode: 'default',
  });
}

export async function closeDb(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
