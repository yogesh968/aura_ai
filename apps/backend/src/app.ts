import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import jwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';
import type { PrismaClient } from '@prisma/client';
import { APP_VERSION, type Config } from './config';
import { createContainer, type Container, type ContainerOverrides } from './container';
import { errorHandler, unauthorized } from './lib/errors';
import { authRoutes } from './routes/auth';
import { dataRoutes } from './routes/data';
import { chatRoutes } from './routes/chat';
import { assistantRoutes } from './routes/assistant';
import { automationRoutes } from './routes/automations';

declare module 'fastify' {
  interface FastifyInstance {
    c: Container;
    authenticate: (req: FastifyRequest) => Promise<void>;
  }
  interface FastifyRequest {
    userId: string;
  }
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: { sub: string; guest: boolean };
    user: { sub: string; guest: boolean };
  }
}

export async function buildApp(config: Config, prisma: PrismaClient, overrides: ContainerOverrides = {}): Promise<FastifyInstance> {
  const app = Fastify({
    logger:
      config.LOG_LEVEL === 'silent'
        ? false
        : {
            level: config.LOG_LEVEL,
            // Never log credentials or tokens.
            redact: ['req.headers.authorization', 'req.headers.cookie', 'req.body.password', 'req.body.refreshToken'],
            ...(config.NODE_ENV === 'development' ? { transport: { target: 'pino-pretty', options: { colorize: true } } } : {}),
          },
    bodyLimit: 1024 * 1024,
    trustProxy: config.NODE_ENV === 'production',
    disableRequestLogging: config.NODE_ENV === 'test',
  });

  app.decorate('c', createContainer(config, prisma, overrides));
  app.decorateRequest('userId', '');
  app.setErrorHandler(errorHandler);

  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(cors, {
    origin: config.CORS_ORIGINS.trim() === '*' ? true : config.CORS_ORIGINS.split(',').map((o) => o.trim()),
    credentials: false,
  });
  await app.register(jwt, {
    secret: config.JWT_SECRET,
    sign: { expiresIn: `${config.ACCESS_TOKEN_TTL_MINUTES}m` },
  });
  if (config.RATE_LIMIT_ENABLED) {
    await app.register(rateLimit, {
      max: 300,
      timeWindow: '1 minute',
      keyGenerator: (req) => {
        // Per-user limits for valid tokens, per-IP otherwise. The signature is
        // verified so a forged token can't choose its own bucket.
        const auth = req.headers.authorization;
        if (auth?.startsWith('Bearer ')) {
          try {
            const payload = app.jwt.verify<{ sub: string }>(auth.slice(7));
            if (payload?.sub) return `u:${payload.sub}`;
          } catch {
            /* fall through */
          }
        }
        return `ip:${req.ip}`;
      },
    });
  }

  app.decorate('authenticate', async (req: FastifyRequest) => {
    try {
      const payload = await req.jwtVerify<{ sub: string; guest: boolean }>();
      req.userId = payload.sub;
    } catch {
      throw unauthorized('Your session has expired');
    }
  });

  app.get('/health', async () => ({
    status: 'ok' as const,
    version: APP_VERSION,
    ai: { provider: app.c.ai.name, available: app.c.ai.available, model: app.c.ai.model },
    features: {
      webSearch: app.c.ai.available && app.c.ai.supportsWebSearch,
      weather: app.c.weather.available,
      documents: true,
    },
  }));

  await app.register(authRoutes, { prefix: '/v1' });
  await app.register(dataRoutes, { prefix: '/v1' });
  await app.register(chatRoutes, { prefix: '/v1' });
  await app.register(assistantRoutes, { prefix: '/v1' });
  await app.register(automationRoutes, { prefix: '/v1' });

  return app;
}
