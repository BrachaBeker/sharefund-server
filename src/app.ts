import cors from 'cors';
import express from 'express';
import swaggerUi from 'swagger-ui-express';
import { z } from 'zod';
import { env } from './config/env';
import { openApiDocument } from './docs/openapi';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import apiRoutes from './routes';

// Validation messages that have no custom text are returned in Hebrew.
z.config(z.locales.he());

export function createApp() {
  const app = express();

  // Render runs the server behind a proxy
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  const allowAll = env.corsOrigins.includes('*');
  app.use(
    cors({
      // requests without an Origin header (Swagger on the same address, curl) are always allowed
      origin: (origin, callback) => {
        const allowed = !origin || allowAll || env.corsOrigins.includes(origin);
        callback(null, allowed);
      },
    }),
  );
  app.use(express.json({ limit: '100kb' }));

  app.get('/', (_req, res) => {
    res.json({ name: 'ShareFund API', docs: '/api-docs', health: '/api/health' });
  });

  app.get('/api-docs.json', (_req, res) => {
    res.json(openApiDocument);
  });
  app.use(
    '/api-docs',
    swaggerUi.serve,
    swaggerUi.setup(openApiDocument, {
      customSiteTitle: 'ShareFund API',
      swaggerOptions: { persistAuthorization: true },
    }),
  );

  app.use('/api', apiRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
