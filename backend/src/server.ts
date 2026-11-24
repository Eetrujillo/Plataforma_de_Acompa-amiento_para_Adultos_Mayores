import { buildApp } from './app.ts';
import { connectDatabase, disconnectDatabase } from './config/database.ts';
import { loadEnv } from './config/env.ts';
import {
  BcryptPasswordHasher,
  createMongooseUserRepository,
} from './modules/auth/index.ts';

async function main(): Promise<void> {
  const env = loadEnv();

  await connectDatabase(env.mongoUrl);
  console.log('[server]', `MongoDB conectado (${env.mongoUrl})`);

  const app = buildApp({
    userRepository: createMongooseUserRepository(),
    passwordHasher: new BcryptPasswordHasher(),
    clock: () => new Date(),
    termsVersion: env.termsVersion,
  });

  const server = app.listen(env.port, () => {
    console.log('[server]', `backend escuchando en el puerto ${env.port}`);
  });

  const shutdown = async (signal: string): Promise<void> => {
    console.log('[server]', `recibido ${signal}, apagando`);
    server.close();
    await disconnectDatabase();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

void main().catch((error: unknown) => {
  console.error('[server]', 'no se pudo arrancar el backend', error);
  process.exit(1);
});
