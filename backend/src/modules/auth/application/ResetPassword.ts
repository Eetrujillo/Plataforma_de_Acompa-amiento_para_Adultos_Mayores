import { AppError } from '../../../shared/errors/AppError.ts';
import { hashVerificationToken } from '../domain/EmailVerificationToken.ts';
import { isValidPassword } from '../domain/User.ts';
import type { Clock, PasswordHasherPort } from './RegisterCaregiver.ts';
import { WEAK_PASSWORD_MESSAGE } from './RegisterCaregiver.ts';
import type { PasswordResetStorePort } from './RequestPasswordReset.ts';

/**
 * Un solo mensaje para "este token no sirve" (S5): vencido, ya usado,
 * inexistente o malformado responden idéntico y sin `details`. Literal de
 * docs/auth-api.md:268-269.
 */
export const RESET_INVALID_TOKEN_MESSAGE =
  'El enlace para restablecer la contraseña no es válido o ya venció';

export interface ResetPasswordCommand {
  token: string;
  password: string;
}

export interface ResetPasswordDeps {
  store: PasswordResetStorePort;
  /** El hash va por el puerto: ningún caso de uso conoce bcrypt (regla de la casa). */
  passwordHasher: PasswordHasherPort;
  clock: Clock;
}

/**
 * Restablecimiento de la contraseña (HU-004). El orden importa:
 *
 * 1. La contraseña nueva se valida **antes** de tocar el token (S7): un
 *    `WEAK_PASSWORD` no quema el enlace, que sigue sirviendo.
 * 2. El consumo del token es **atómico y previo** (S6/D3): un `updateOne`
 *    condicionado a `usedAt: null` y vencimiento vigente marca `usedAt` antes
 *    de la cuenta. Dos canjes simultáneos no pueden dar dos `200`.
 * 3. Sólo con el consume ganador se escribe la contraseña, en la MISMA
 *    operación en que el adaptador limpia el bloqueo y sube `sessionVersion`
 *    (D4). Si esa escritura falla, la cuenta queda intacta y el enlace
 *    quemado (fail closed).
 */
export class ResetPassword {
  private readonly store: PasswordResetStorePort;
  private readonly passwordHasher: PasswordHasherPort;
  private readonly clock: Clock;

  constructor(deps: ResetPasswordDeps) {
    this.store = deps.store;
    this.passwordHasher = deps.passwordHasher;
    this.clock = deps.clock;
  }

  async execute(command: ResetPasswordCommand): Promise<{ reset: true }> {
    if (!isValidPassword(command.password)) {
      throw new AppError(400, 'WEAK_PASSWORD', WEAK_PASSWORD_MESSAGE, { field: 'password' });
    }
    // A la base sólo llega el SHA-256 del token en claro (S4/D5: el helper
    // compartido de HU-002). Con el reloj del servidor (S2).
    const consumed = await this.store.consumePasswordResetToken(
      hashVerificationToken(command.token),
      this.clock.now(),
    );
    if (consumed === null) {
      throw new AppError(400, 'INVALID_TOKEN', RESET_INVALID_TOKEN_MESSAGE);
    }
    // C4: el resultado de la escritura no se ignora: si no matcheó ninguna
    // cuenta (eliminada después de pedir el enlace), la respuesta es el mismo
    // INVALID_TOKEN, no un `200` con la contraseña sin cambiar.
    const matched = await this.store.resetPassword(
      consumed.email,
      await this.passwordHasher.hash(command.password),
    );
    if (!matched) {
      throw new AppError(400, 'INVALID_TOKEN', RESET_INVALID_TOKEN_MESSAGE);
    }
    return { reset: true };
  }
}
