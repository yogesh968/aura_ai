/** Drops only the database this test run created, then stops the test instance. */
export default async function globalTeardown() {
  const g = globalThis as Record<string, unknown>;
  const pg = g.__AURA_PG__ as { stop(): Promise<void>; dropDatabase(name: string): Promise<void> } | undefined;
  const database = g.__AURA_TEST_DB__ as string | undefined;
  if (pg && database?.startsWith('aura_test_')) await pg.dropDatabase(database).catch(() => undefined);
  await pg?.stop();
}
