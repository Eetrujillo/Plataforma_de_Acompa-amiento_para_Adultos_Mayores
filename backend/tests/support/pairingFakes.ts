/**
 * HU-008 — dobles del slice pairing para los tests de emisión: repositorio de
 * tokens en memoria, codificador QR que graba el payload y codificador que
 * falla (S4: 503 sin tocar la base).
 */
import { randomUUID } from 'node:crypto';

import { AppError } from '../../src/shared/errors/AppError.ts';

import type {
  PairingTokenRecord,
  PairingTokenRepositoryPort,
  PairingTokenWrite,
} from '../../src/modules/pairing/application/PairingTokenRepositoryPort.ts';
import type { PairingQrEncoderPort } from '../../src/modules/pairing/application/PairingQrEncoderPort.ts';
import type {
  PairingSeniorProfile,
  RedeemProfileReaderPort,
  RedeemSeniorProfile,
  SeniorProfileReaderPort,
} from '../../src/modules/pairing/application/SeniorProfileReaderPort.ts';
import type {
  RedeemSeniorWriterPort,
  SeniorConsentWrite,
} from '../../src/modules/pairing/application/RedeemSeniorWriterPort.ts';
import type { LinkStatus } from '../../src/modules/seniors/domain/seniorProfile.ts';
import type { RegisterFailedLoginConfig } from '../../src/modules/auth/application/Login.ts';
import type { LockoutState, NextLockoutState } from '../../src/modules/auth/domain/loginLockout.ts';
import { PAIRING_QR_UNAVAILABLE_MESSAGE } from '../../src/modules/pairing/application/pairingMessages.ts';

/**
 * Doble en memoria del puerto de tokens: guarda sólo lo que el adaptador real
 * guardaría (el hash y los flags de uso). `createError` permite simular el
 * fallo de la escritura desde la persistencia (S15: falla cerrado) y los
 * recibidos por `create` quedan a la vista para pinar que nunca viaja el token
 * en claro.
 */
export class InMemoryPairingTokenRepository implements PairingTokenRepositoryPort {
  readonly tokens = new Map<string, PairingTokenRecord>();
  /** Los objetos recibidos por `create`, en orden: el test pina su forma. */
  readonly createdWrites: PairingTokenWrite[] = [];
  createCalls = 0;
  createError: Error | null = null;
  readonly invalidations: { seniorId: string; invalidatedAt: Date }[] = [];

  async invalidateUnusedForSenior(seniorId: string, invalidatedAt: Date): Promise<number> {
    this.invalidations.push({ seniorId, invalidatedAt });
    let changed = 0;
    for (const [hash, record] of this.tokens) {
      if (record.seniorId !== seniorId) continue;
      if (record.usedAt !== null || record.invalidatedAt !== null) continue;
      this.tokens.set(hash, { ...record, invalidatedAt: new Date(invalidatedAt.getTime()) });
      changed += 1;
    }
    return changed;
  }

  async create(token: PairingTokenWrite): Promise<PairingTokenRecord> {
    this.createCalls += 1;
    this.createdWrites.push(token);
    if (this.createError !== null) throw this.createError;
    const record: PairingTokenRecord = {
      id: randomUUID(),
      seniorId: token.seniorId,
      caregiverId: token.caregiverId,
      tokenHash: token.tokenHash,
      expiresAt: token.expiresAt,
      usedAt: null,
      invalidatedAt: null,
      createdAt: new Date(token.expiresAt.getTime()),
    };
    this.tokens.set(token.tokenHash, record);
    return record;
  }

  // ─── HU-009: lectura y reclamo del canje (D5) ────────────────────────────

  findByHashCalls = 0;
  claimCalls = 0;

  async findByTokenHash(tokenHash: string): Promise<PairingTokenRecord | null> {
    this.findByHashCalls += 1;
    return this.tokens.get(tokenHash) ?? null;
  }

  /**
   * Espeja el `findOneAndUpdate` del adaptador real: una sola operación —
   * matchea no usado + no invalidado + vigente, fija `usedAt` y devuelve el
   * registro; el perdedor recibe `null` sin escribir nada.
   */
  async claimUnused(tokenHash: string, now: Date): Promise<PairingTokenRecord | null> {
    this.claimCalls += 1;
    const record = this.tokens.get(tokenHash);
    if (
      record === undefined ||
      record.usedAt !== null ||
      record.invalidatedAt !== null ||
      record.expiresAt.getTime() <= now.getTime()
    ) {
      return null;
    }
    const claimed: PairingTokenRecord = { ...record, usedAt: new Date(now.getTime()) };
    this.tokens.set(tokenHash, claimed);
    return claimed;
  }
}

/**
 * Codificador que no decodifica nada: graba el payload (así el test saca el
 * token en claro que el caso de uso le entregó) y devuelve una data URL con
 * el prefijo prometido.
 */
export class RecordingQrEncoder implements PairingQrEncoderPort {
  readonly payloads: string[] = [];

  async toDataUrl(payload: string): Promise<string> {
    this.payloads.push(payload);
    return `data:image/png;base64,${Buffer.from(payload, 'utf8').toString('base64')}`;
  }
}

/** S4/S13: el codificador caído. El puerto documenta qué lanza el adaptador
 * real (D9: el AppError 503 lo levanta el adaptador, no el caso de uso), así
 * que el doble falla EXACTAMENTE como el contrato del puerto promete. */
export class FailingQrEncoder implements PairingQrEncoderPort {
  async toDataUrl(): Promise<string> {
    throw new AppError(503, 'PAIRING_QR_UNAVAILABLE', PAIRING_QR_UNAVAILABLE_MESSAGE);
  }
}

/**
 * Doble del lector de perfiles con la semántica del adaptador real: sólo
 * resuelve SENIOR con vínculo activo; lo ajeno, inexistente y las cuentas
 * CAREGIVER devuelven `null` (el 404 lo levanta el caso de uso). Los perfiles
 * se siembran con la forma que el canje dejaba antes de HU-005: `linkStatus`
 * puede ser `null` (S18).
 */
export class StaticSeniorReader implements SeniorProfileReaderPort {
  readonly profiles = new Map<string, PairingSeniorProfile>();
  private readonly authorized = new Set<string>();

  seed(profile: PairingSeniorProfile, caregiverId: string): void {
    this.profiles.set(profile.id, profile);
    this.authorized.add(`${profile.id}::${caregiverId}`);
  }

  asLinked(seniorId: string): void {
    const record = this.profiles.get(seniorId);
    if (record === undefined) throw new Error(`sin perfil ${seniorId} para marcar`);
    this.profiles.set(seniorId, { ...record, linkStatus: 'LINKED' as LinkStatus });
  }

  asPending(seniorId: string): void {
    const record = this.profiles.get(seniorId);
    if (record === undefined) throw new Error(`sin perfil ${seniorId} para marcar`);
    this.profiles.set(seniorId, { ...record, linkStatus: 'PENDING' });
  }

  async findSeniorForCaregiver(
    seniorId: string,
    caregiverId: string,
  ): Promise<PairingSeniorProfile | null> {
    if (!this.authorized.has(`${seniorId}::${caregiverId}`)) return null;
    return this.profiles.get(seniorId) ?? null;
  }
}

/**
 * HU-009 — doble del lector del canje (D6/D11): la MISMA semántica de
 * propiedad que el emisor (S17): sólo perfiles SENIOR con vínculo activo con
 * el dueño del token — lo ajeno, inexistente y CAREGIVER devuelven `null` y el
 * caso de uso responde el 409 genérico de un token consumido.
 */
export class StaticRedeemReader implements RedeemProfileReaderPort {
  readonly profiles = new Map<string, RedeemSeniorProfile>();
  private readonly authorized = new Set<string>();

  seed(profile: RedeemSeniorProfile, caregiverId = ''): void {
    this.profiles.set(profile.id, { ...profile, createdAt: new Date(profile.createdAt.getTime()) });
    this.authorized.add(`${profile.id}::${caregiverId}`);
  }

  asLinked(seniorId: string): void {
    this.setLinkStatus(seniorId, 'LINKED');
  }

  asPending(seniorId: string): void {
    this.setLinkStatus(seniorId, 'PENDING');
  }

  private setLinkStatus(seniorId: string, linkStatus: LinkStatus): void {
    const record = this.profiles.get(seniorId);
    if (record === undefined) throw new Error(`sin perfil ${seniorId} para marcar`);
    this.profiles.set(seniorId, { ...record, linkStatus });
  }

  async findRedeemSeniorForCaregiver(
    seniorId: string,
    caregiverId: string,
  ): Promise<RedeemSeniorProfile | null> {
    if (!this.authorized.has(`${seniorId}::${caregiverId}`)) return null;
    return this.profiles.get(seniorId) ?? null;
  }
}

/** El estado de un perfil dentro del escritor del canje, observable en tests. */
export interface RedeemSeniorWriterState {
  linkStatus: LinkStatus;
  acceptedTermsAt: Date | null;
  termsVersion: string | null;
  ipAddress: string | null;
  redeemFailedAttempts: number | null;
  redeemLockedUntil: Date | null;
}

/**
 * HU-009 — doble del escritor del canje (D7/D8): la transición LINKED con la
 * evidencia en una sola escritura condicional y la racha/bloqueo del canje
 * espejando el pipeline del login (un bloqueo ya vencido reinicia la racha).
 */
export class InMemoryRedeemSeniorWriter implements RedeemSeniorWriterPort {
  readonly seniors = new Map<string, RedeemSeniorWriterState>();
  /** Las escrituras recibidas por `markLinkedWithConsent`, en orden. */
  readonly consentWrites: SeniorConsentWrite[] = [];
  consentWriteCalls = 0;
  /** Rechaza `markLinkedWithConsent` con este error (S18: falla cerrado). */
  markLinkedError: Error | null = null;

  seed(
    seniorId: string,
    overrides: Partial<Pick<RedeemSeniorWriterState, 'linkStatus'>> = {},
  ): void {
    this.seniors.set(seniorId, {
      linkStatus: overrides.linkStatus ?? 'PENDING',
      acceptedTermsAt: null,
      termsVersion: null,
      ipAddress: null,
      redeemFailedAttempts: null,
      redeemLockedUntil: null,
    });
  }

  async markLinkedWithConsent(write: SeniorConsentWrite): Promise<boolean> {
    this.consentWriteCalls += 1;
    this.consentWrites.push(write);
    if (this.markLinkedError !== null) throw this.markLinkedError;
    const senior = this.seniors.get(write.seniorId);
    // El filtro condicional real matchea sólo `linkStatus: 'PENDING'`.
    if (senior === undefined || senior.linkStatus !== 'PENDING') return false;
    this.seniors.set(write.seniorId, {
      ...senior,
      linkStatus: 'LINKED',
      acceptedTermsAt: new Date(write.acceptedTermsAt.getTime()),
      termsVersion: write.termsVersion,
      ...(write.ipAddress === undefined ? {} : { ipAddress: write.ipAddress }),
    });
    return true;
  }

  async redeemLockoutState(seniorId: string): Promise<LockoutState | null> {
    const senior = this.seniors.get(seniorId);
    if (senior === undefined) return null;
    return {
      failedLoginAttempts: senior.redeemFailedAttempts,
      lockedUntil: senior.redeemLockedUntil,
    };
  }

  async registerRedeemFailure(
    seniorId: string,
    config: RegisterFailedLoginConfig,
  ): Promise<NextLockoutState | null> {
    const senior = this.seniors.get(seniorId);
    if (senior === undefined) return null;
    // Espeja el pipeline del login (HU-003/D8): un bloqueo ya vencido
    // reinicia la racha; el umbral fija lockedUntil en la misma escritura.
    const expired =
      senior.redeemLockedUntil !== null && senior.redeemLockedUntil.getTime() <= config.now.getTime();
    const attempts = (expired ? 0 : (senior.redeemFailedAttempts ?? 0)) + 1;
    const lockedUntil =
      attempts >= config.maxAttempts ? new Date(config.now.getTime() + config.lockMs) : null;
    this.seniors.set(seniorId, {
      ...senior,
      redeemFailedAttempts: attempts,
      redeemLockedUntil: lockedUntil,
    });
    return { failedLoginAttempts: attempts, lockedUntil };
  }

  async clearRedeemFailures(seniorId: string): Promise<void> {
    const senior = this.seniors.get(seniorId);
    if (senior === undefined) return;
    this.seniors.set(seniorId, {
      ...senior,
      redeemFailedAttempts: 0,
      redeemLockedUntil: null,
    });
  }
}
