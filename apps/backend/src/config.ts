import { z } from 'zod';

const bool = z
  .enum(['true', 'false', '1', '0'])
  .optional()
  .transform((v) => v === 'true' || v === '1');

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().default('0.0.0.0'),
  PORT: z.coerce.number().int().positive().default(4000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  CORS_ORIGINS: z.string().default('*'),
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  ACCESS_TOKEN_TTL_MINUTES: z.coerce.number().int().min(1).max(1440).default(15),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).max(365).default(30),
  AI_PROVIDER: z.enum(['anthropic', 'none']).default('anthropic'),
  ANTHROPIC_API_KEY: z.string().optional(),
  AI_MODEL: z.string().default('claude-opus-5-5'),
  AI_EFFORT: z.enum(['low', 'medium', 'high']).default('low'),
  AI_MAX_TOOL_ITERATIONS: z.coerce.number().int().min(1).max(20).default(8),
  AI_MAX_OUTPUT_TOKENS: z.coerce.number().int().min(1024).max(64000).default(16000),
  AI_REFUSAL_FALLBACK: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),
  WEATHER_ENABLED: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),
  EXPO_PUSH_ENABLED: bool,
  EXPO_ACCESS_TOKEN: z.string().optional(),
  RATE_LIMIT_ENABLED: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),
  SCHEDULER_ENABLED: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),
});

export type Config = z.infer<typeof envSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}\nSee apps/backend/.env.example`);
  }
  const cfg = parsed.data;
  if (cfg.NODE_ENV === 'production' && cfg.CORS_ORIGINS.trim() === '*') {
    throw new Error('CORS_ORIGINS must list explicit origins in production');
  }
  return cfg;
}

export const APP_VERSION = '0.1.0';
