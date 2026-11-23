import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadConfig, redactDatabaseUrl } from '../config.js';
import { createDbPool, type DbPool } from './pool.js';

function resolveMigrationsDir(): string {
  const candidates = [
    path.resolve(import.meta.dirname, '..', '..', 'migrations'),
    path.resolve(import.meta.dirname, '..', '..', '..', '..', 'migrations'),
  ];
  for (const dir of candidates) {
    if (fs.existsSync(dir)) return dir;
  }
  throw new Error(`Could not locate server/migrations directory (checked: ${candidates.join(', ')})`);
}

export async function runMigrations(pool: DbPool): Promise<string[]> {
  const migrationsDir = resolveMigrationsDir();
  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version VARCHAR(64) PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  const appliedRows = await pool.query<{ version: string }>(
    'SELECT version FROM schema_migrations ORDER BY version ASC'
  );
  const applied = new Set(appliedRows.rows.map((r) => r.version));
  const newlyApplied: string[] = [];

  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (version) VALUES ($1)', [file]);
      await client.query('COMMIT');
      newlyApplied.push(file);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  return newlyApplied;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  (async () => {
    const config = loadConfig();
    const pool = createDbPool(config.databaseUrl);
    try {
      console.log(`[migrate] Connecting to ${redactDatabaseUrl(config.databaseUrl)}`);
      const applied = await runMigrations(pool);
      console.log(
        applied.length > 0
          ? `[migrate] Applied migrations: ${applied.join(', ')}`
          : '[migrate] Schema already up to date.'
      );
    } finally {
      await pool.end();
    }
  })().catch((err) => {
    console.error('[migrate] FAILED:', err);
    process.exit(1);
  });
}
