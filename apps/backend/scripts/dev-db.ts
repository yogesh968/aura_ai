import { startLocalPostgres } from './pg';

const port = Number(process.env.PG_PORT ?? 5433);

async function main() {
  const { pg, url } = await startLocalPostgres({ dataDir: '.pgdata', port, database: 'aura' });
  console.warn(`\n  PostgreSQL is running.\n  DATABASE_URL=${url}\n\n  Press Ctrl+C to stop.\n`);
  const stop = async () => {
    await pg.stop();
    process.exit(0);
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
  setInterval(() => undefined, 1 << 30);
}

main().catch((err) => {
  console.error('Failed to start local PostgreSQL:', err);
  process.exit(1);
});
