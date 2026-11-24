import { buildApp } from './app.ts';
import { connectDatabase, disconnectDatabase } from './config/database.ts';
import { loadEnv } from './config/env.ts';
import { redactConnectionStrings, redactMongoUrl } from './config/redactMongoUrl.ts';
import {
  BcryptPasswordHasher,
  createMongooseUserRepository,
} from './modules/auth/index.ts';

async function main(): Promise<void> {
  const env = loadEnv();

  await connectDatabase(env.mongoUrl);
  // La URL puede llevar credenciales: sólo se loguea redactada.
  console.log('[server]', `MongoDB conectado (${redactMongoUrl(env.mongoUrl)})`);

  const app = buildApp(
    {
      userRepository: createMongooseUserRepository(),
      passwordHasher: new BcryptPasswordHasher(),
      clock: () => new Date(),
      termsVersion: env.termsVersion,
    },
    { trustProxyHops: env.trustProxyHops },
  );

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
  // Los errores del driver repiten la URI de conexión con credenciales: el
  // mensaje se scrubea antes de imprimirse.
  const detail =
    error instanceof Error
      ? `${error.name}: ${redactConnectionStrings(error.message)}`
      : redactConnectionStrings(String(error));
  console.error('[server]', 'no se pudo arrancar el backend:', detail);
  process.exit(1);
});
