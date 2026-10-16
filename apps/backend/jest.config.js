/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/test', '<rootDir>/src'],
  transform: { '^.+\.(ts|js)$': ['@swc/jest'] },
  // ESM-only dependencies that must be transpiled for Jest's CommonJS runtime.
  transformIgnorePatterns: ['/node_modules/(?!(cookie)/)'],
  globalSetup: '<rootDir>/test/global-setup.ts',
  globalTeardown: '<rootDir>/test/global-teardown.ts',
  setupFiles: ['<rootDir>/test/env.ts'],
  testTimeout: 30000,
};
