import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config({ quiet: true });

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(5000),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is missing'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_EXPIRES_IN: z.string().default('2h'),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  BCRYPT_ROUNDS: z.coerce.number().int().min(4).max(14).default(10),
  SEED_DEMO_DATA: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment variables:');
  for (const issue of parsed.error.issues) {
    console.error(`  ${issue.path.join('.')}: ${issue.message}`);
  }
  process.exit(1);
}

const data = parsed.data;

export const env = {
  nodeEnv: data.NODE_ENV,
  isProduction: data.NODE_ENV === 'production',
  port: data.PORT,
  databaseUrl: data.DATABASE_URL,
  jwtSecret: data.JWT_SECRET,
  jwtExpiresIn: data.JWT_EXPIRES_IN,
  // "*" allows every origin
  corsOrigins: data.CORS_ORIGIN.split(',')
    .map((o) => o.trim().replace(/\/$/, ''))
    .filter(Boolean),
  bcryptRounds: data.BCRYPT_ROUNDS,
  seedDemoData: data.SEED_DEMO_DATA,
};
