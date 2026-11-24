import { AppError } from '../../../shared/errors/AppError.ts';
import { isValidEmailFormat, normalizeEmail } from '../domain/User.ts';
import { generatePasswordResetToken } from '../domain/PasswordResetToken.ts';
import type { Clock } from './RegisterCaregiver.ts';
import type { AuthLogger, EmailSenderPort } from './EmailSenderPort.ts';
import type { ResendThrottle } from './ResendThrottle.ts';

/** D2/L3: mensaje propio de forgot-password, distinto del de verificación. */
export const FORGOT_LIMIT_MESSAGE =
  'Pediste demasiados enlaces de recuperación. Esperá unos minutos antes de pedir otro.';

/**
 * Puerto de persistencia del token de reset (D1: colección propia
 * `PasswordResetToken`; un token de verificación de correo no puede cambiar
 * la contraseña). Los métodos reciben el correo ya normalizado; el caso de
 * uso garantiza esa normalización antes de llamar.
 */
export interface PasswordResetStorePort {
  /** Pisa el/los token(s) anterior(es): pedir otro enlace quema el viejo (S8). */
  savePasswordResetToken(
    email: string,
    token: { tokenHash: string; expiresAt: Date },
  ): Promise<void>;
  /** Estado mínimo para decidir si corresponde enviar (S1), sin exponer el hash. */
  findPasswordResetState(
    email: string,
  ): Promise<{ fullName: string; passwordHash: string | null } | null>;
  /**
   * S6/D3: consumo atómico y previo. Una única escritura condicionada —
   * `usedAt: null` y vencimiento vigente — fija `usedAt`; devuelve `null`
   * cuando el hash no matchea, ya está usado o venció, para que dos canjes
   * del mismo token no puedan dar dos `200`. Sólo después de un consume
   * ganador el caso de uso toca la cuenta.
   */
  consumePasswordResetToken(
    tokenHash: string,
    now: Date,
  ): Promise<{ userId: string; email: string } | null>;
  /**
   * D4: una sola escritura — hash nuevo + `failedLoginAttempts`/`lockedUntil`
   * en null + `$inc` de `sessionVersion` — para que no exista ventana con
   * contraseña nueva y sesiones viejas vivas. Reporta si la escritura matcheó
   * la cuenta (C4): `false` significa que el enlace sirvió pero la cuenta ya
   * no existe, y el caso de uso no puede responder un `200` mentiroso.
   */
  resetPassword(email: string, passwordHash: string): Promise<boolean>;
}

export interface RequestPasswordResetDeps {
  store: PasswordResetStorePort;
  emailSender: EmailSenderPort;
  clock: Clock;
  /** APP_URL de configuración: el enlace jamás se arma con el Host del pedido (D5). */
  appUrl: string;
  /** PASSWORD_RESET_TTL_MINUTES. */
  ttlMinutes: number;
  logger: AuthLogger;
  /** Sólo forgot-password consume cupo, con su propia instancia (S9). */
  forgotThrottle?: ResendThrottle;
}

/** `${APP_URL}/reset-password?token=<token en claro>`, sin consultar headers. */
export function buildPasswordResetLink(appUrl: string, rawToken: string): string {
  return `${appUrl.replace(/\/+$/, '')}/reset-password?token=${encodeURIComponent(rawToken)}`;
}

/**
 * S1: el mensaje siempre es `202 { accepted: true }`, exista o no la cuenta y
 * tenga o no contraseña (Google). Un envío o persistencia que fallan no rompen
 * la respuesta: `{ accepted: true }` con un warn, nunca 500 (S10).
 */
export class RequestPasswordReset {
  private readonly store: PasswordResetStorePort;
  private readonly emailSender: EmailSenderPort;
  private readonly clock: Clock;
  private readonly appUrl: string;
  private readonly ttlMinutes: number;
  private readonly logger: AuthLogger;
  private readonly forgotThrottle?: ResendThrottle;

  constructor(deps: RequestPasswordResetDeps) {
    this.store = deps.store;
    this.emailSender = deps.emailSender;
    this.clock = deps.clock;
    this.appUrl = deps.appUrl;
    this.ttlMinutes = deps.ttlMinutes;
    this.logger = deps.logger;
    this.forgotThrottle = deps.forgotThrottle;
  }

  async execute(rawEmail: string): Promise<{ accepted: true }> {
    const email = normalizeEmail(rawEmail);
    // El formato se valida antes de tocar el contador: un INVALID_EMAIL no
    // consume cupo (S1), igual que en resend-verification (S9 del contrato).
    if (!isValidEmailFormat(email)) {
      throw new AppError(400, 'INVALID_EMAIL', 'El correo no es válido', { field: 'email' });
    }
    // S9: cupo propio, evalúa antes de la base y cuenta también correos sin
    // cuenta — el 429 no es oráculo de existencia.
    if (this.forgotThrottle !== undefined) {
      const decision = this.forgotThrottle.consume(email);
      if (!decision.allowed) {
        throw new AppError(429, 'TOO_MANY_REQUESTS', FORGOT_LIMIT_MESSAGE, {
          retryAfterSeconds: decision.retryAfterSeconds,
        });
      }
    }
    try {
      const state = await this.store.findPasswordResetState(email);
      // S1: sin cuenta, o cuenta sin contraseña (Google), no se manda nada y
      // la respuesta es idéntica.
      if (state === null || state.passwordHash === null) return { accepted: true };
      const token = generatePasswordResetToken(this.clock.now(), this.ttlMinutes);
      // S8: guardar el nuevo quema el anterior — sólo sirve el último enviado.
      await this.store.savePasswordResetToken(email, {
        tokenHash: token.tokenHash,
        expiresAt: token.expiresAt,
      });
      const delivery = await this.emailSender.sendPasswordResetEmail({
        to: email,
        fullName: state.fullName,
        link: buildPasswordResetLink(this.appUrl, token.raw),
        expiresInMinutes: this.ttlMinutes,
      });
      if (!delivery.delivered) {
        this.logger.warn(
          `[email] no se pudo enviar el correo de restablecimiento por el canal ${delivery.channel}; el token quedó emitido y puede pedirse de nuevo`,
        );
      }
    } catch (error: unknown) {
      // Un envío caído no rompe la respuesta (S10): sigue 202 con un warn.
      this.logger.warn(
        `[email] falló la emisión del correo de restablecimiento; la operación continúa y el enlace puede pedirse de nuevo: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
    return { accepted: true };
  }
}
