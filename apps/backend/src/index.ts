import { PrismaClient } from '@prisma/client';
import { buildApp } from './app';
import { loadConfig } from './config';

async function main() {
  const config = loadConfig();
  const prisma = new PrismaClient();
  await prisma.$connect();
  const app = await buildApp(config, prisma);

  let timer: NodeJS.Timeout | null = null;
  if (config.SCHEDULER_ENABLED) {
    let running = false;
    timer = setInterval(async () => {
      if (running) return;
      running = true;
      try {
        const started = await app.c.automations.tick();
        if (started) app.log.info({ started }, 'automation runs executed');
      } catch (err) {
        app.log.error({ err }, 'automation scheduler tick failed');
      } finally {
        running = false;
      }
    }, 30_000);
  }

  const shutdown = async (signal: string) => {
    app.log.info({ signal }, 'shutting down');
    if (timer) clearInterval(timer);
    await app.close();
    await prisma.$disconnect();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  await app.listen({ host: config.HOST, port: config.PORT });
  app.log.info(
    `AURA backend ready — AI: ${app.c.ai.available ? `${app.c.ai.name} (${app.c.ai.model})` : 'not configured'}`,
  );
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
