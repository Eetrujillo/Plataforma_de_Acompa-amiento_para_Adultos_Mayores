import { buildApp } from './app.ts';
import { connectDatabase, disconnectDatabase } from './config/database.ts';
import { loadEnv, globalLoginIpBucketWarning } from './config/env.ts';
import { redactConnectionStrings, redactMongoUrl } from './config/redactMongoUrl.ts';
import {
  BcryptPasswordHasher,
  createEmailSender,
  createMongooseUserRepository,
  describeEmailChannel,
} from './modules/auth/index.ts';
import type { AuthLogger } from './modules/auth/index.ts';
import { createMongooseSeniorRepository } from './modules/seniors/index.ts';

/**
 * Describe un fallo de arranque para el log: el texto se scrubea porque el
 * driver repite la URI de conexión con credenciales, y las líneas del stack se
 * conservan porque son el único diagnóstico de un arranque caído.
 */
function describeStartupError(error: unknown): string {
  if (!(error instanceof Error)) return redactConnectionStrings(String(error));
  const header = `${error.name}: ${redactConnectionStrings(error.message)}`;
  if (error.stack === undefined) return header;
  const [first, ...rest] = error.stack.split('\n');
  // El stack empieza repitiendo `name: message`; se descarta esa línea y se
  // conservan los frames, scrubeados por si alguno nombra la conexión.
  void first;
  return [header, ...rest.map((line) => redactConnectionStrings(line))].join('\n');
}

async function main(): Promise<void> {
  const env = loadEnv();
  // C1: detrás de un proxy con 0 saltos declarados, el límite por IP del login
  // se vuelve una bolsa global compartida por todos los clientes — el arranque
  // lo avisa fuerte en producción; parar el proceso es decisión del humano.
  const ipBucketWarning = globalLoginIpBucketWarning(env.nodeEnv, env.trustProxyHops);
  if (ipBucketWarning !== null) console.warn('[server]', ipBucketWarning);

  await connectDatabase(env.mongoUrl);
  // La URL puede llevar credenciales: sólo se loguea redactada.
  console.log('[server]', `MongoDB conectado (${redactMongoUrl(env.mongoUrl)})`);

  const logger: AuthLogger = {
    info: (message: string) => console.log('[email]', message),
    warn: (message: string) => console.warn('[email]', message),
  };
  // La guía operativa lo busca: docker compose logs backend | grep "email delivery"
  console.log('[server]', `email delivery: ${describeEmailChannel(env.smtp)}`);

  const userRepository = createMongooseUserRepository();
  // HU-005/HU-007: el slice seniors tiene su propio adaptador (D6): perfiles
  // en `users` con la ficha médica y vínculos en `seniorlinks`.
  const seniorRepository = createMongooseSeniorRepository();
  const app = buildApp(
    {
      userRepository,
      verificationStore: userRepository,
      passwordHasher: new BcryptPasswordHasher(),
      clock: () => new Date(),
      termsVersion: env.termsVersion,
      emailSender: createEmailSender(env.smtp, logger),
      logger,
      appUrl: env.appUrl,
      emailVerificationTtlHours: env.emailVerificationTtlHours,
      resendThrottleMax: env.resendThrottleMax,
      resendThrottleWindowMinutes: env.resendThrottleWindowMinutes,
      // HU-004: tokens de reset en su colección propia (D1), límite propio (S9).
      passwordResetStore: userRepository,
      passwordResetTtlMinutes: env.passwordResetTtlMinutes,
      forgotThrottleMax: env.forgotThrottleMax,
      forgotThrottleWindowMinutes: env.forgotThrottleWindowMinutes,
      // HU-003: la sesión comparte el repositorio; sin JWT_SECRET el router
      // falla al componerse (fail closed — en producción `loadEnv` ya lo exige).
      loginStore: userRepository,
      sessionUserReader: userRepository,
      jwtSecret: env.jwtSecret,
      jwtExpiresIn: env.jwtExpiresIn,
      lockoutMaxAttempts: env.lockoutMaxAttempts,
      lockoutMinutes: env.lockoutMinutes,
      loginIpMaxAttempts: env.loginIpMaxAttempts,
      loginIpWindowMinutes: env.loginIpWindowMinutes,
      // HU-005/HU-007: los perfiles y sus vínculos comparten el reloj del
      // servidor; la persistencia es el adaptador mongoose del slice.
      seniorRepository,
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
  // Los errores del driver repiten la URI de conexión con credenciales: se
  // scrubea el texto, pero se conserva el stack para poder diagnosticar.
  console.error('[server]', 'no se pudo arrancar el backend:', describeStartupError(error));
  process.exit(1);
});
