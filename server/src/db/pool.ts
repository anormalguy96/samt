import pg from 'pg';

const { Pool } = pg;

export type DbPool = pg.Pool;

export function createDbPool(databaseUrl: string, maxConnections = 10): DbPool {
  return new Pool({
    connectionString: databaseUrl,
    max: maxConnections,
    idleTimeoutMillis: 15000,
    connectionTimeoutMillis: 5000,
  });
}

export async function checkDatabaseReady(pool: DbPool): Promise<{
  ok: boolean;
  latencyMs: number;
  error?: string;
}> {
  const start = performance.now();
  try {
    await pool.query('SELECT 1 AS ok');
    return {
      ok: true,
      latencyMs: parseFloat((performance.now() - start).toFixed(2)),
    };
  } catch (err) {
    return {
      ok: false,
      latencyMs: parseFloat((performance.now() - start).toFixed(2)),
      error: err instanceof Error ? err.message : 'Database connection check failed',
    };
  }
}
