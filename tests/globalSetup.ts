import { execSync } from 'node:child_process';
import dotenv from 'dotenv';

/** Runs once before all the tests: prepares the tables of the test database. */
export default function setup(): void {
  dotenv.config({ quiet: true });
  const url = process.env.TEST_DATABASE_URL;

  if (!url) {
    throw new Error('TEST_DATABASE_URL is missing. Add it to the .env file (see .env.example).');
  }
  // The tests delete all rows before every test - never let them touch a real database.
  if (!url.toLowerCase().includes('test')) {
    throw new Error('TEST_DATABASE_URL must point to a database whose name contains "test".');
  }

  execSync('npx prisma migrate deploy', {
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'pipe',
  });
}
