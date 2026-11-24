import { RegisterCaregiver } from './application/RegisterCaregiver.ts';
import { RequestEmailVerification } from './application/RequestEmailVerification.ts';
import { ConfirmEmail } from './application/ConfirmEmail.ts';
import { ResendThrottle } from './application/ResendThrottle.ts';
import { Login } from './application/Login.ts';
import type { LoginStorePort, PasswordComparerPort } from './application/Login.ts';
import { LoginIpThrottle } from './application/LoginIpThrottle.ts';
import { createAuthRoutes } from './infrastructure/authRoutes.ts';
import type { AuthUseCases } from './infrastructure/AuthController.ts';
import type { PasswordHasherPort, UserRepositoryPort, Clock } from './application/RegisterCaregiver.ts';
import type { VerificationStorePort } from './application/RequestEmailVerification.ts';
import type { AuthLogger, EmailSenderPort } from './application/EmailSenderPort.ts';
import { JwtTokenService } from './infrastructure/JwtTokenService.ts';
import { authMiddleware } from '../../shared/middlewares/authMiddleware.ts';
import type { SessionUserReaderPort } from '../../shared/middlewares/authMiddleware.ts';
import type { Router } from 'express';

export interface AuthDependencies {
  userRepository: UserRepositoryPort;
  /** Puerto del token de verificación; el repositorio real lo satisface junto con userRepository. */
  verificationStore: VerificationStorePort;
  passwordHasher: PasswordHasherPort & PasswordComparerPort;
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
  /** HU-003: el almacén de credenciales/bloqueo vive en el mismo repositorio de User. */
  loginStore: LoginStorePort;
  /** Lector de sesión para el authMiddleware (S7). */
  sessionUserReader: SessionUserReaderPort;
  /** JWT_SECRET; `null` en desarrollo sin secreto es fail closed (no hay login). */
  jwtSecret: string | null;
  /** JWT_EXPIRES_IN (default `7d`). */
  jwtExpiresIn: string;
  /** LOCKOUT_MAX_ATTEMPTS / LOCKOUT_MINUTES (S3). */
  lockoutMaxAttempts: number;
  lockoutMinutes: number;
  /** LOGIN_IP_MAX_ATTEMPTS / LOGIN_IP_WINDOW_MINUTES (S9, D2). */
  loginIpMaxAttempts: number;
  loginIpWindowMinutes: number;
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
  // D4: un único JwtTokenService firma y verifica; el caso de uso sólo pide sign.
  if (deps.jwtSecret === null) {
    throw new Error(
      'JWT_SECRET es obligatorio para emitir sesiones: el login no queda disponible sin él.',
    );
  }
  const sessionToken = new JwtTokenService(deps.jwtSecret, deps.jwtExpiresIn);
  const requireSession = authMiddleware({ verifier: sessionToken, reader: deps.sessionUserReader });
  const login = new Login({
    store: deps.loginStore,
    passwordHasher: deps.passwordHasher,
    sessionToken,
    clock,
    ipThrottle: new LoginIpThrottle(clock, {
      max: deps.loginIpMaxAttempts,
      windowMs: deps.loginIpWindowMinutes * 60_000,
    }),
    lockout: {
      maxAttempts: deps.lockoutMaxAttempts,
      lockMs: deps.lockoutMinutes * 60_000,
    },
  });
  const useCases: AuthUseCases = {
    registerCaregiver,
    requestEmailVerification,
    confirmEmail: new ConfirmEmail({ store: deps.verificationStore, clock }),
    login,
  };
  return createAuthRoutes(useCases, requireSession);
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
export { Login } from './application/Login.ts';
export {
  INVALID_CREDENTIALS_MESSAGE,
  ACCOUNT_LOCKED_MESSAGE,
  EMAIL_NOT_VERIFIED_MESSAGE,
  LOGIN_IP_LIMIT_MESSAGE,
} from './application/Login.ts';
export type {
  LoginStorePort,
  LoginCredentials,
  RegisterFailedLoginConfig,
  PasswordComparerPort,
  SessionTokenPort,
  LoginIpLimitPort,
} from './application/Login.ts';
export { LoginIpThrottle } from './application/LoginIpThrottle.ts';
export type { IpThrottleConfig } from './application/LoginIpThrottle.ts';
export { JwtTokenService } from './infrastructure/JwtTokenService.ts';
export type { VerifiedSessionClaims } from './infrastructure/JwtTokenService.ts';
export { authMiddleware, MISSING_TOKEN_MESSAGE, INVALID_SESSION_MESSAGE } from '../../shared/middlewares/authMiddleware.ts';
export type {
  SessionUser,
  SessionUserReaderPort,
  SessionTokenVerifierPort,
} from '../../shared/middlewares/authMiddleware.ts';
export { sessionClaims } from './domain/sessionClaims.ts';
export type { SessionClaims, SessionUserSnapshot } from './domain/sessionClaims.ts';
export {
  evaluateLockout,
  registerFailure,
  clearedLockoutState,
  lockoutRetrySeconds,
} from './domain/loginLockout.ts';
export type {
  LockoutConfig,
  LockoutState,
  LockoutVerdict,
  NextLockoutState,
} from './domain/loginLockout.ts';
