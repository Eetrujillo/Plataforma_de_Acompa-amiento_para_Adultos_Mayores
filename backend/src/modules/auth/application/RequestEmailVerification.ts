import { AppError } from '../../../shared/errors/AppError.ts';
import { isValidEmailFormat, normalizeEmail } from '../domain/User.ts';
import { generateVerificationToken } from '../domain/EmailVerificationToken.ts';
import type { StoredUser, Clock } from './RegisterCaregiver.ts';
import type { AuthLogger, EmailSenderPort } from './EmailSenderPort.ts';
import type { ResendThrottle } from './ResendThrottle.ts';

/** Literal de docs/auth-api.md:94-102. */
export const RESEND_LIMIT_MESSAGE =
  'Pediste demasiados enlaces de verificación. Esperá unos minutos antes de pedir otro.';

/**
 * Puerto de persistencia del token de verificación (D3: vive en el documento
 * User, no en una colección aparte). Los métodos reciben el correo ya
 * normalizado; el caso de uso garantiza esa normalización antes de llamar.
 */
export interface VerificationStorePort {
  /** Pisa el token anterior: el reenvío invalida el enlace viejo (S8). */
  saveVerificationToken(email: string, token: { tokenHash: string; expiresAt: Date }): Promise<void>;
  /** Estado mínimo para decidir si corresponde enviar, sin exponer el hash. */
  findEmailVerificationState(
    email: string,
  ): Promise<{ fullName: string; emailVerifiedAt: Date | null } | null>;
  /** Búsqueda por hash: el token en claro nunca llega a la base (S6). */
  findByVerificationTokenHash(tokenHash: string): Promise<VerificationTokenTarget | null>;
  /**
   * Marca el correo verificado con el reloj del servidor y quema el token (S2).
   * C2: el canje es atómico y condicionado — devuelve `null` en lugar de
   * escribir cuando el hash ya no matchea o el correo ya está verificado, para
   * que dos usos del mismo token no puedan dar dos escrituras.
   */
  markEmailVerified(
    email: string,
    tokenHash: string,
    verifiedAt: Date,
  ): Promise<StoredUser | null>;
}

export interface VerificationTokenTarget {
  id: string;
  email: string;
  fullName: string;
  tokenHash: string;
  expiresAt: Date | null;
  emailVerifiedAt: Date | null;
}

export interface RequestEmailVerificationDeps {
  store: VerificationStorePort;
  emailSender: EmailSenderPort;
  clock: Clock;
  /** APP_URL de configuración: el enlace jamás se arma con el Host del pedido (S5). */
  appUrl: string;
  /** EMAIL_VERIFICATION_TTL_HOURS. */
  ttlHours: number;
  logger: AuthLogger;
  /** Sólo el reenvío consume cupo; el registro no (S4/S7). */
  resendThrottle?: ResendThrottle;
}

/** `${APP_URL}/verify-email?token=<token en claro>`, sin consultar headers. */
export function buildVerificationLink(appUrl: string, rawToken: string): string {
  return `${appUrl.replace(/\/+$/, '')}/verify-email?token=${encodeURIComponent(rawToken)}`;
}

/**
 * Emisión del correo de verificación, para el registro (S1) y para el reenvío
 * (S7/S8). Un envío o una persistencia que fallan no rompen la operación:
 * responde `{ sent: false }` con un warn, nunca un 500.
 */
export class RequestEmailVerification {
  private readonly store: VerificationStorePort;
  private readonly emailSender: EmailSenderPort;
  private readonly clock: Clock;
  private readonly appUrl: string;
  private readonly ttlHours: number;
  private readonly logger: AuthLogger;
  private readonly resendThrottle?: ResendThrottle;

  constructor(deps: RequestEmailVerificationDeps) {
    this.store = deps.store;
    this.emailSender = deps.emailSender;
    this.clock = deps.clock;
    this.appUrl = deps.appUrl;
    this.ttlHours = deps.ttlHours;
    this.logger = deps.logger;
    this.resendThrottle = deps.resendThrottle;
  }

  /** Rama del registro: la cuenta acaba de crearse, siempre corresponde enviar. */
  async issue(email: string): Promise<{ sent: boolean }> {
    try {
      const state = await this.store.findEmailVerificationState(email);
      if (state === null || state.emailVerifiedAt !== null) return { sent: false };
      const token = generateVerificationToken(this.clock.now(), this.ttlHours);
      await this.store.saveVerificationToken(email, {
        tokenHash: token.tokenHash,
        expiresAt: token.expiresAt,
      });
      const delivery = await this.emailSender.sendVerificationEmail({
        to: email,
        fullName: state.fullName,
        link: buildVerificationLink(this.appUrl, token.raw),
        expiresInHours: this.ttlHours,
      });
      if (!delivery.delivered) {
        this.logger.warn(
          `[email] no se pudo enviar el correo de verificación por el canal ${delivery.channel}; el token quedó emitido y puede pedirse de nuevo`,
        );
        return { sent: false };
      }
      return { sent: true };
    } catch (error: unknown) {
      this.logger.warn(
        `[email] falló la emisión del correo de verificación; la operación continúa y el enlace puede pedirse de nuevo: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return { sent: false };
    }
  }

  /**
   * Rama del reenvío (S7): el formato se valida antes de tocar el contador —
   * un `INVALID_EMAIL` no consume cupo — y el contador corre antes de buscar
   * la cuenta, para que el `429` no sea un oráculo de existencia.
   */
  async resend(rawEmail: string): Promise<{ accepted: true }> {
    const email = normalizeEmail(rawEmail);
    if (!isValidEmailFormat(email)) {
      throw new AppError(400, 'INVALID_EMAIL', 'El correo no es válido', { field: 'email' });
    }
    if (this.resendThrottle !== undefined) {
      const decision = this.resendThrottle.consume(email);
      if (!decision.allowed) {
        throw new AppError(429, 'TOO_MANY_REQUESTS', RESEND_LIMIT_MESSAGE, {
          retryAfterSeconds: decision.retryAfterSeconds,
        });
      }
    }
    await this.issue(email);
    return { accepted: true };
  }
}
