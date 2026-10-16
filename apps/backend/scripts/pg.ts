import { existsSync } from 'node:fs';
import path from 'node:path';
import EmbeddedPostgres from 'embedded-postgres';

/**
 * Local PostgreSQL for development and tests, without Docker or a system
 * install. Binaries come from the `embedded-postgres` npm package.
 * Production should use a managed PostgreSQL instance instead.
 */
export interface LocalPgOptions {
  dataDir: string;
  port: number;
  database: string;
  persistent?: boolean;
}

export async function startLocalPostgres(opts: LocalPgOptions) {
  const pg = new EmbeddedPostgres({
    databaseDir: path.resolve(opts.dataDir),
    user: 'aura',
    password: 'aura',
    port: opts.port,
    persistent: opts.persistent ?? true,
    onLog: () => undefined,
  });
  const fresh = !existsSync(path.join(opts.dataDir, 'PG_VERSION'));
  if (fresh) await pg.initialise();
  await pg.start();
  try {
    await pg.createDatabase(opts.database);
  } catch {
    // already exists
  }
  return {
    pg,
    url: `postgresql://aura:aura@localhost:${opts.port}/${opts.database}`,
  };
}
