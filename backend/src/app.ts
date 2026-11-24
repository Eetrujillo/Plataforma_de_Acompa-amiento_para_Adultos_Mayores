import express from 'express';
import type { Express } from 'express';
import { buildAuthRouter, buildSessionGuard } from './modules/auth/index.ts';
import type { AuthDependencies } from './modules/auth/index.ts';
import { buildSeniorsRouter } from './modules/seniors/index.ts';
import type { SeniorsDependencies } from './modules/seniors/index.ts';
import { buildPairingRouter } from './modules/pairing/index.ts';
import type { PairingDependencies } from './modules/pairing/index.ts';
import { errorHandler } from './shared/middlewares/errorHandler.ts';

export type { AuthDependencies } from './modules/auth/index.ts';
export type { SeniorsDependencies } from './modules/seniors/index.ts';
export type { PairingDependencies } from './modules/pairing/index.ts';

/** Opciones de la aplicación que no son dependencias del módulo de auth. */
export interface AppOptions {
  /** Saltos de proxy confiables delante del backend. Default `0`: ninguno. */
  trustProxyHops?: number;
}

/**
 * Fábrica de la aplicación Express. Las dependencias (repositorio, hasher,
 * reloj, versión de términos) se inyectan: así los tests sustituyen la
 * persistencia por un doble en memoria sin tocar Mongo. La sesión se arma
 * una sola vez y los routers privados la comparten.
 */
export function buildApp(
  deps: AuthDependencies & SeniorsDependencies & PairingDependencies,
  options: AppOptions = {},
): Express {
  const app = express();
  // Fail closed: sólo se confía en `X-Forwarded-For` cuando la configuración
  // declara cuántos proxies reales hay delante. Con el default (0) un cliente
  // directo no puede elegir la IP que queda como evidencia de la Ley 1581.
  const trustProxyHops = options.trustProxyHops ?? 0;
  app.set('trust proxy', trustProxyHops > 0 ? trustProxyHops : false);
  app.use(express.json({ limit: '100kb' }));

  app.use('/api/auth', buildAuthRouter(deps));
  // HU-005/HU-007: el router de seniors lleva siempre sesión + rol CAREGIVER;
  // el guard de sesión sale del módulo auth con las mismas dependencias.
  app.use('/api/seniors', buildSeniorsRouter({ ...deps, requireSession: buildSessionGuard(deps) }));
  // HU-008: la emisión del QR es del familiar de la sesión (S10); el mismo
  // guard armado de arriba protege la credencial. La invalidación del QR
  // anterior vive en el caso de uso (S7/S22): no hay otra ruta de regeneración.
  app.use('/api/pairing', buildPairingRouter({ ...deps, requireSession: buildSessionGuard(deps) }));

  app.use((_req: express.Request, res: express.Response) => {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Ruta no encontrada' } });
  });

  app.use(errorHandler);
  return app;
}
