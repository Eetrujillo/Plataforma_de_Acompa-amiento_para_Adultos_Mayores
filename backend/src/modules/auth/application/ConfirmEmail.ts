import { AppError } from '../../../shared/errors/AppError.ts';
import { hashVerificationToken, isVerificationTokenUsable } from '../domain/EmailVerificationToken.ts';
import type { Clock, StoredUser } from './RegisterCaregiver.ts';
import type { VerificationStorePort } from './RequestEmailVerification.ts';

/**
 * Un solo mensaje para "este token no sirve" (D2): vencido, ya usado,
 * inexistente o malformado responden idéntico y sin `details` (S3).
 */
export const INVALID_TOKEN_MESSAGE = 'El enlace de verificación no es válido o ya venció';

export interface ConfirmEmailDeps {
  store: VerificationStorePort;
  clock: Clock;
}

/**
 * Confirmación del correo (S2): marca `emailVerifiedAt` con el reloj del
 * servidor, invalida el token usado y no emite sesión (D1).
 */
export class ConfirmEmail {
  private readonly store: VerificationStorePort;
  private readonly clock: Clock;

  constructor(deps: ConfirmEmailDeps) {
    this.store = deps.store;
    this.clock = deps.clock;
  }

  async execute(rawToken: string): Promise<StoredUser> {
    const record = await this.store.findByVerificationTokenHash(hashVerificationToken(rawToken));
    if (record === null || !isVerificationTokenUsable(record, this.clock.now())) {
      throw new AppError(400, 'INVALID_TOKEN', INVALID_TOKEN_MESSAGE);
    }
    return this.store.markEmailVerified(record.email, this.clock.now());
  }
}
