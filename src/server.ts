import { createApp } from './app';
import { env } from './config/env';
import { prisma } from './db/prisma';
import { seedDemoData } from './db/seed';

async function main(): Promise<void> {
  await prisma.$connect();

  if (env.seedDemoData) {
    await seedDemoData();
  }

  const app = createApp();
  const server = app.listen(env.port, () => {
    console.log(`ShareFund server is running on port ${env.port}`);
    console.log(`Swagger: http://localhost:${env.port}/api-docs`);
  });

  const shutdown = () => {
    server.close(() => {
      void prisma.$disconnect().then(() => process.exit(0));
    });
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((err: unknown) => {
  console.error('Failed to start the server:', err);
  process.exit(1);
});
