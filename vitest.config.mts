import dotenv from 'dotenv';
import { defineConfig } from 'vitest/config';

dotenv.config({ quiet: true });

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    globalSetup: ['tests/globalSetup.ts'],
    // all the test files share one database, so they run one after the other
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 120_000,
    env: {
      NODE_ENV: 'test',
      // the tests always run on the separate test database
      DATABASE_URL: process.env.TEST_DATABASE_URL ?? '',
      JWT_SECRET: 'test-secret-used-only-by-the-automated-tests',
      JWT_EXPIRES_IN: '1h',
      BCRYPT_ROUNDS: '4',
      CORS_ORIGIN: 'http://localhost:5173',
      SEED_DEMO_DATA: 'false',
    },
  },
});
