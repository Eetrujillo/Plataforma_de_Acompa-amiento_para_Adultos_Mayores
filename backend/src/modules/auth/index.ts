import { RegisterCaregiver } from './application/RegisterCaregiver.ts';
import { RequestEmailVerification } from './application/RequestEmailVerification.ts';
import { ConfirmEmail } from './application/ConfirmEmail.ts';
import { ResendThrottle } from './application/ResendThrottle.ts';
import { createAuthRoutes } from './infrastructure/authRoutes.ts';
import type { AuthUseCases } from './infrastructure/AuthController.ts';
import type { PasswordHasherPort, UserRepositoryPort, Clock } from './application/RegisterCaregiver.ts';
import type { VerificationStorePort } from './application/RequestEmailVerification.ts';
import type { AuthLogger, EmailSenderPort } from './application/EmailSenderPort.ts';
import type { Router } from 'express';

export interface AuthDependencies {
  userRepository: UserRepositoryPort;
  /** Puerto del token de verificación; el repositorio real lo satisface junto con userRepository. */
  verificationStore: VerificationStorePort;
  passwordHasher: PasswordHasherPort;
  /** Reloj del servidor; fija acceptedTermsAt (Ley 1581) y el vencimiento del token (S1). */
  clock: () => Date;
  /** Versión de la política de tratamiento de datos (env TERMS_VERSION). */
  termsVersion: string;
  /** Puerto de correo; canal console o smtp según SMTP_HOST (D4). */
  emailSender: EmailSenderPort;
  logger: AuthLogger;
  /** APP_URL: el enlace se arma de acá, nunca del Host del pedido (S5). */
  appUrl: string;
  /** EMAIL_VERIFICATION_TTL_HOURS. */
  emailVerificationTtlHours: number;
  /** RESEND_THROTTLE_MAX. */
  resendThrottleMax: number;
  /** RESEND_THROTTLE_WINDOW_MINUTES. */
  resendThrottleWindowMinutes: number;
}

/** Punto de montaje del módulo auth: compone los casos de uso y devuelve el router. */
export function buildAuthRouter(deps: AuthDependencies): Router {
  const clock: Clock = { now: deps.clock };
  const throttle = new ResendThrottle(clock, {
    max: deps.resendThrottleMax,
    windowMs: deps.resendThrottleWindowMinutes * 60_000,
  });
  const requestEmailVerification = new RequestEmailVerification({
    store: deps.verificationStore,
    emailSender: deps.emailSender,
    clock,
    appUrl: deps.appUrl,
    ttlHours: deps.emailVerificationTtlHours,
    logger: deps.logger,
    // Sólo el reenvío consume cupo: el registro pasa por `issue`, no por el throttle (S4/S7).
    resendThrottle: throttle,
  });
  const registerCaregiver = new RegisterCaregiver({
    userRepository: deps.userRepository,
    passwordHasher: deps.passwordHasher,
    clock,
    termsVersion: deps.termsVersion,
    emailVerification: requestEmailVerification,
  });
  const useCases: AuthUseCases = {
    registerCaregiver,
    requestEmailVerification,
    confirmEmail: new ConfirmEmail({ store: deps.verificationStore, clock }),
  };
  return createAuthRoutes(useCases);
}

export { RegisterCaregiver } from './application/RegisterCaregiver.ts';
export type {
  PasswordHasherPort,
  StoredUser,
  UserRepositoryPort,
} from './application/RegisterCaregiver.ts';
export { RequestEmailVerification } from './application/RequestEmailVerification.ts';
export type { VerificationStorePort } from './application/RequestEmailVerification.ts';
export { ConfirmEmail, INVALID_TOKEN_MESSAGE } from './application/ConfirmEmail.ts';
export { ResendThrottle } from './application/ResendThrottle.ts';
export { createEmailSender, describeEmailChannel, smtpTransportOptions } from './infrastructure/EmailSender.ts';
export type { SmtpConfig } from './infrastructure/EmailSender.ts';
export type { AuthLogger, EmailSenderPort } from './application/EmailSenderPort.ts';
export { BcryptPasswordHasher } from './infrastructure/BcryptPasswordHasher.ts';
export { createMongooseUserRepository } from './infrastructure/MongooseUserRepository.ts';
