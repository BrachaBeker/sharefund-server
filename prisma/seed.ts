// Run with: npm run db:seed
import { prisma } from '../src/db/prisma';
import { seedDemoData } from '../src/db/seed';

seedDemoData()
  .catch((err: unknown) => {
    console.error('Seed failed:', err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
