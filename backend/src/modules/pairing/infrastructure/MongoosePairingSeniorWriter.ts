/**
 * HU-009 / D7-D8 — adaptador Mongoose del escritor del perfil del canje, sobre
 * el MISMO documento `User` del adulto mayor que el resto de la plataforma.
 *
 * - `markLinkedWithConsent`: la transición `PENDING → LINKED` con la evidencia
 *   de la Ley 1581 en LA MISMA escritura condicional (D4). El filtro
 *   `linkStatus: 'PENDING'` es lo que evita el doble vínculo aunque dos canjes
 *   ganen carreras distintas; un documento legacy sin el campo no matchea
 *   (falla cerrado — el lector del canje ya lo cuenta como vinculado).
 * - Racha y bloqueo del canje (D8) espejan el pipeline atómico de
 *   `registerFailedLogin` (HU-003): cada llamada cuenta exactamente un fallo,
 *   un bloqueo ya vencido reinicia la racha y la MISMA operación fija
 *   `lockedUntil` al llegar al umbral.
 */
import { UserModel } from '../../../shared/models/User.ts';
import type { RegisterFailedLoginConfig } from '../../auth/application/Login.ts';
import type { LockoutState, NextLockoutState } from '../../auth/domain/loginLockout.ts';
import type {
  RedeemSeniorWriterPort,
  SeniorConsentWrite,
} from '../application/RedeemSeniorWriterPort.ts';

/** Proyección de la racha del canje (HU-009/D8). */
interface RedeemLockoutProjection {
  redeemFailedAttempts?: number | null;
  redeemLockedUntil?: Date | null;
}

interface PersistedLockedDoc extends RedeemLockoutProjection {
  redeemFailedAttempts: number;
  redeemLockedUntil: Date | null;
}

export function createMongooseRedeemSeniorWriter(): RedeemSeniorWriterPort {
  return {
    async markLinkedWithConsent(write: SeniorConsentWrite): Promise<boolean> {
      const stored = await UserModel.findOneAndUpdate(
        { _id: write.seniorId, linkStatus: 'PENDING' },
        {
          $set: {
            linkStatus: 'LINKED',
            acceptedTermsAt: write.acceptedTermsAt,
            termsVersion: write.termsVersion,
            // Sin IP válida el campo no se escribe: queda null (evidencia
            // parcial, nunca falsa) — la misma regla de la Ley 1581 del registro.
            ...(write.ipAddress === undefined ? {} : { ipAddress: write.ipAddress }),
          },
        },
        { new: true, projection: '_id' },
      ).lean<unknown>();
      return stored !== null;
    },

    async redeemLockoutState(seniorId: string): Promise<LockoutState | null> {
      const doc = await UserModel.findById(seniorId)
        .select('redeemFailedAttempts redeemLockedUntil')
        .lean<RedeemLockoutProjection | null>();
      if (doc === null) return null;
      return {
        failedLoginAttempts: doc.redeemFailedAttempts ?? null,
        lockedUntil: doc.redeemLockedUntil ?? null,
      };
    },

    /**
     * D8: incremento atómico e incondicional (update pipeline) sobre el
     * documento del adulto mayor — la misma forma de HU-003 con los campos
     * `redeemFailedAttempts` / `redeemLockedUntil`. Devuelve el estado que
     * quedó guardado; `null` cuando el perfil ya no existe.
     */
    async registerRedeemFailure(
      seniorId: string,
      config: RegisterFailedLoginConfig,
    ): Promise<NextLockoutState | null> {
      const pipeline = [
        {
          $set: {
            __streak: {
              $cond: [
                {
                  $and: [
                    { $ne: ['$redeemLockedUntil', null] },
                    { $lt: ['$redeemLockedUntil', config.now] },
                  ],
                },
                0,
                { $ifNull: ['$redeemFailedAttempts', 0] },
              ],
            },
          },
        },
        {
          $set: {
            redeemFailedAttempts: { $add: ['$__streak', 1] },
            redeemLockedUntil: {
              $cond: [
                { $gte: [{ $add: ['$__streak', 1] }, config.maxAttempts] },
                { $add: [config.now, config.lockMs] },
                null,
              ],
            },
          },
        },
        { $unset: '__streak' },
      ];
      const doc = await UserModel.findOneAndUpdate({ _id: seniorId }, pipeline, {
        new: true,
        projection: 'redeemFailedAttempts redeemLockedUntil',
      }).lean<PersistedLockedDoc>();
      if (doc === null) return null;
      return {
        failedLoginAttempts: doc.redeemFailedAttempts,
        lockedUntil: doc.redeemLockedUntil ?? null,
      };
    },

    /** S7: el canje exitoso deja la racha en 0 y `lockedUntil` en null. */
    async clearRedeemFailures(seniorId: string): Promise<void> {
      await UserModel.updateOne(
        { _id: seniorId },
        { $set: { redeemFailedAttempts: 0, redeemLockedUntil: null } },
      );
    },
  };
}
