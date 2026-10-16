// Test configuration. The database URL points at the per-run database
// created by global-setup in the test-only PostgreSQL instance (port 5434).
import { readFileSync } from 'node:fs';
import path from 'node:path';

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = readFileSync(path.resolve(__dirname, '../.pgdata-test/test-database-url'), 'utf8');
process.env.JWT_SECRET = 'test-secret-that-is-at-least-32-characters-long';
process.env.LOG_LEVEL = 'silent';
process.env.AI_PROVIDER = 'none';
process.env.SCHEDULER_ENABLED = 'false';
process.env.EXPO_PUSH_ENABLED = 'false';
process.env.RATE_LIMIT_ENABLED = 'false';
