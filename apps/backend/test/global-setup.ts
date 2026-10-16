import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { startLocalPostgres } from '../scripts/pg';

/**
 * Each test run gets its own freshly created database (never resetting an
 * existing one) inside a test-only PostgreSQL instance on port 5434.
 * Migrations are applied with the non-destructive `migrate deploy`.
 */
export default async function globalSetup() {
  const database = `aura_test_${Date.now()}`;
  const { pg, url } = await startLocalPostgres({ dataDir: '.pgdata-test', port: 5434, database });
  (globalThis as Record<string, unknown>).__AURA_PG__ = pg;
  (globalThis as Record<string, unknown>).__AURA_TEST_DB__ = database;
  mkdirSync(path.resolve(__dirname, '../.pgdata-test'), { recursive: true });
  writeFileSync(path.resolve(__dirname, '../.pgdata-test/test-database-url'), url);
  execSync('npx prisma migrate deploy', {
    cwd: path.resolve(__dirname, '..'),
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'pipe',
  });
}
