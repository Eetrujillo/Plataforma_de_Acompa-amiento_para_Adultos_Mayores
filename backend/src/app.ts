import express from 'express';
import type { Express } from 'express';
import { buildAuthRouter } from './modules/auth/index.ts';
import type { AuthDependencies } from './modules/auth/index.ts';
import { errorHandler } from './shared/middlewares/errorHandler.ts';

export type { AuthDependencies } from './modules/auth/index.ts';

/**
 * Fábrica de la aplicación Express. Las dependencias (repositorio, hasher,
 * reloj, versión de términos) se inyectan: así los tests sustituyen la
 * persistencia por un doble en memoria sin tocar Mongo.
 */
export function buildApp(deps: AuthDependencies): Express {
  const app = express();
  // Detrás de nginx hay que confiar en el proxy para que req.ip sea la IP real.
  app.set('trust proxy', true);
  app.use(express.json({ limit: '100kb' }));

  app.use('/api/auth', buildAuthRouter(deps));

  app.use((_req: express.Request, res: express.Response) => {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Ruta no encontrada' } });
  });

  app.use(errorHandler);
  return app;
}
