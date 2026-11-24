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
  SeniorProfileReaderPort,
} from '../../src/modules/pairing/application/SeniorProfileReaderPort.ts';
import type { LinkStatus } from '../../src/modules/seniors/domain/seniorProfile.ts';
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
