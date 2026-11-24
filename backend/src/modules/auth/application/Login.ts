import { AppError } from '../../../shared/errors/AppError.ts';
import type { Clock, StoredUser } from './RegisterCaregiver.ts';
import { normalizeEmail } from '../domain/User.ts';
import type { UserRole } from '../domain/User.ts';
import { evaluateLockout, lockoutRetrySeconds } from '../domain/loginLockout.ts';
import type { LockoutConfig, NextLockoutState } from '../domain/loginLockout.ts';
import { sessionClaims } from '../domain/sessionClaims.ts';
import type { SessionClaims } from '../domain/sessionClaims.ts';
import type { ThrottleDecision } from './ResendThrottle.ts';

export const INVALID_CREDENTIALS_MESSAGE = 'Credenciales inválidas';
/** Literal de docs/auth-api.md:154-159 (S13). */
export const ACCOUNT_LOCKED_MESSAGE =
  'Bloqueamos tu cuenta por demasiados intentos fallidos. Esperá unos minutos antes de volver a intentar.';
export const EMAIL_NOT_VERIFIED_MESSAGE = 'Confirmá tu correo antes de iniciar sesión';
export const LOGIN_IP_LIMIT_MESSAGE =
  'Demasiados intentos desde tu conexión. Esperá unos minutos antes de volver a intentar.';

/**
 * Credenciales mínimas para el login. Es la única lectura que trae el hash de
 * la contraseña: ningún otro método del puerto lo devuelve (huésped de la
 * regla de la casa "nunca leer un hash por fuera de la búsqueda de credenciales").
 */
export interface LoginCredentials {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  /** `null` en cuentas sin contraseña (Google): el login por contraseña no les aplica. */
  passwordHash: string | null;
  emailVerifiedAt: Date | null;
  sessionVersion: number | null;
  failedLoginAttempts: number | null;
  lockedUntil: Date | null;
}

/**
 * C2: la escritura del fallo es un incremento atómico e incondicional (semántica
 * de `$inc`, en Mongo un update pipeline): cada llamada cuenta exactamente un
 * fallo, sin condiciones sobre valores leídos antes. La MISMA operación fija
 * `lockedUntil` cuando la racha alcanza el umbral y devuelve el estado que
 * quedó guardado. En una carrera ningún fallo se pierde ni se duplica; el
 * bloqueo siempre aterriza aunque 20 pedidos lleguen a la vez.
 */
export interface RegisterFailedLoginConfig {
  /** LOCKOUT_MAX_ATTEMPTS (S3): al alcanzarlo, la misma escritura fija el bloqueo. */
  maxAttempts: number;
  /** LOCKOUT_MINUTES en milisegundos: duración del bloqueo que se fija. */
  lockMs: number;
  /** Reloj del servidor: decide si un bloqueo previo ya venció (la racha reinicia). */
  now: Date;
}

export interface LoginStorePort {
  findCredentialsByEmail(email: string): Promise<LoginCredentials | null>;
  /**
   * C2: incrementa la racha exactamente una vez y fija `lockedUntil` en la misma
   * operación al llegar al umbral. Devuelve el estado persistido; `null` cuando
   * el correo ya no tiene cuenta (no debería ocurrir tras `findCredentialsByEmail`).
   */
  registerFailedLogin(
    email: string,
    config: RegisterFailedLoginConfig,
  ): Promise<NextLockoutState | null>;
  clearFailedLogins(email: string): Promise<void>;
}

/** Comparación de contraseñas: sólo el puerto conoce bcrypt/proveedor (regla de la casa). */
export interface PasswordComparerPort {
  compare(plainPassword: string, passwordHash: string): Promise<boolean>;
}

/** El caso de uso pide `sign(claims)`; el único firmante es JwtTokenService (D4). */
export interface SessionTokenPort {
  sign(claims: SessionClaims): string;
}

/**
 * Límite por IP (D2): `check` se evalúa antes de tocar la base y no registra el
 * intento; `recordFailure` anota un fallo ya respondido (los 429 no cuentan,
 * skill rate-limiting regla 6).
 */
export interface LoginIpLimitPort {
  check(ip: string): ThrottleDecision;
  recordFailure(ip: string): void;
}

export interface LoginDeps {
  store: LoginStorePort;
  passwordHasher: PasswordComparerPort;
  sessionToken: SessionTokenPort;
  clock: Clock;
  ipThrottle: LoginIpLimitPort;
  /** LOCKOUT_MAX_ATTEMPTS / LOCKOUT_MINUTES (S3). */
  lockout: LockoutConfig;
}

export interface LoginCommand {
  email: string;
  password: string;
  /** IP del transporte que arma el controlador desde `req.ip`. */
  ipAddress: string;
}

export interface LoginResult {
  token: string;
  user: StoredUser;
}

/**
 * Login del familiar (HU-003). Antioráculo: un solo 401 para correo inexistente
 * y contraseña incorrecta; el bloqueo por cuenta sólo aplica a cuentas reales
 * (D1: un correo sin cuenta nunca escribe estado ni llega al 429) y el límite
 * por IP se evalúa antes de la base (D3).
 */
export class Login {
  private readonly store: LoginStorePort;
  private readonly passwordHasher: PasswordComparerPort;
  private readonly sessionToken: SessionTokenPort;
  private readonly clock: Clock;
  private readonly ipThrottle: LoginIpLimitPort;
  private readonly lockout: LockoutConfig;

  constructor(deps: LoginDeps) {
    this.store = deps.store;
    this.passwordHasher = deps.passwordHasher;
    this.sessionToken = deps.sessionToken;
    this.clock = deps.clock;
    this.ipThrottle = deps.ipThrottle;
    this.lockout = deps.lockout;
  }

  async execute(command: LoginCommand): Promise<LoginResult> {
    const ip = command.ipAddress.trim();
    // D3: el límite por IP va antes de tocar la base; no escribe estado ni
    // depende de que el correo exista (así el propio límite no se vuelve oráculo).
    const ipDecision = this.ipThrottle.check(ip);
    if (!ipDecision.allowed) {
      throw new AppError(429, 'TOO_MANY_REQUESTS', LOGIN_IP_LIMIT_MESSAGE, {
        retryAfterSeconds: ipDecision.retryAfterSeconds,
      });
    }

    const email = normalizeEmail(command.email);
    const credentials = await this.store.findCredentialsByEmail(email);
    if (credentials === null) {
      // D1: un correo sin cuenta nunca se bloquea ni escribe estado. El fallo
      // sí consume cupo del límite por IP, que no depende del correo.
      this.ipThrottle.recordFailure(ip);
      throw new AppError(401, 'UNAUTHORIZED', INVALID_CREDENTIALS_MESSAGE);
    }

    const now = this.clock.now();
    const verdict = evaluateLockout(credentials, now);
    if (verdict.locked) {
      // S12: estando bloqueada, la contraseña correcta también se rechaza con
      // el mismo 429 — el chequeo va antes de comparar la contraseña.
      throw new AppError(429, 'ACCOUNT_LOCKED', ACCOUNT_LOCKED_MESSAGE, {
        retryAfterSeconds: verdict.retryAfterSeconds,
      });
    }

    const matches =
      credentials.passwordHash === null
        ? false
        : await this.passwordHasher.compare(command.password, credentials.passwordHash);
    if (!matches) {
      // C2: la escritura es atómica e incondicional — el estado devuelto es el
      // que quedó guardado, no una proyección de valores leídos antes.
      const persisted = await this.store.registerFailedLogin(email, {
        maxAttempts: this.lockout.maxAttempts,
        lockMs: this.lockout.lockMs,
        now,
      });
      this.ipThrottle.recordFailure(ip);
      if (persisted !== null && persisted.lockedUntil !== null) {
        // El intento que bloquea ya responde 429 (S3), con 900s al bloquear (S13).
        throw new AppError(429, 'ACCOUNT_LOCKED', ACCOUNT_LOCKED_MESSAGE, {
          retryAfterSeconds: lockoutRetrySeconds(this.lockout),
        });
      }
      throw new AppError(401, 'UNAUTHORIZED', INVALID_CREDENTIALS_MESSAGE);
    }

    if (credentials.emailVerifiedAt === null) {
      // S11: el 403 no limpia la racha — la cuenta sin confirmar puede bloquearse.
      throw new AppError(403, 'EMAIL_NOT_VERIFIED', EMAIL_NOT_VERIFIED_MESSAGE);
    }

    // S5: el login correcto deja la racha en 0 y lockedUntil en null.
    await this.store.clearFailedLogins(email);
    const token = this.sessionToken.sign(sessionClaims(credentials));
    return {
      token,
      user: {
        id: credentials.id,
        email: credentials.email,
        fullName: credentials.fullName,
        role: credentials.role,
      },
    };
  }
}
