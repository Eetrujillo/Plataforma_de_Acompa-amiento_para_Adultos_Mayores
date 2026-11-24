import { randomUUID } from 'node:crypto';

import { createOwnerLink } from '../../src/modules/seniors/domain/seniorLink.ts';
import type { SeniorLinkRecord } from '../../src/modules/seniors/domain/seniorLink.ts';
import type {
  SeniorProfileDocument,
  SeniorProfileRecord,
} from '../../src/modules/seniors/domain/seniorProfile.ts';
import type {
  CaregiverSummary,
  SeniorRepositoryPort,
} from '../../src/modules/seniors/application/SeniorRepositoryPort.ts';

/** Id como los ObjectId de Mongo: 24 caracteres hexadecimales. */
function fakeObjectIdHex(): string {
  return randomUUID().replace(/-/g, '').slice(0, 24);
}

/**
 * Doble en memoria del puerto del slice seniors (D6). Perfiles en un `Map`,
 * vínculos en un array. `caregiverNames` suplanta la colección `users`: el
 * listado de familiares completo el nombre desde la cuenta del caregiver.
 *
 * Los fallos se simulan con `createError` (rechaza el alta entera) y
 * `linkError` (el perfil queda guardado sin vínculo, D4 — igual que el
 * adaptador real, que no usa transacción).
 */
export class InMemorySeniorRepository implements SeniorRepositoryPort {
  readonly profiles = new Map<string, SeniorProfileRecord>();
  readonly links: SeniorLinkRecord[] = [];
  /** caregiverId → fullName, como la colección `users` lo haría. */
  readonly caregiverNames = new Map<string, string>();
  createError: Error | null = null;
  linkError: Error | null = null;
  createCalls = 0;
  linkCalls = 0;

  async createSeniorProfile(
    profile: SeniorProfileDocument,
    ownerCaregiverId: string,
    linkedAt: Date,
  ): Promise<SeniorProfileRecord> {
    this.createCalls += 1;
    if (this.createError !== null) throw this.createError;
    const record: SeniorProfileRecord = {
      id: fakeObjectIdHex(),
      fullName: profile.fullName,
      timezone: profile.timezone,
      linkStatus: profile.linkStatus,
      createdAt: linkedAt,
      bloodType: profile.bloodType,
      allergies: profile.allergies,
      conditions: profile.conditions,
      medications: profile.medications,
      emergencyContact: profile.emergencyContact,
    };
    this.profiles.set(record.id, record);
    this.linkCalls += 1;
    if (this.linkError !== null) throw this.linkError;
    // D4: segundo write del alta. Si `linkError` está sembrado, el perfil ya
    // quedó guardado y queda huérfano: nadie lo lista, abre ni reclama.
    this.links.push(
      createOwnerLink({
        seniorId: record.id,
        caregiverId: ownerCaregiverId,
        createdAt: linkedAt,
      }),
    );
    return record;
  }

  async listSeniorsForCaregiver(caregiverId: string): Promise<SeniorProfileRecord[]> {
    const seniorIds = new Set(
      this.links
        .filter((link) => link.status === 'ACTIVE' && link.caregiverId === caregiverId)
        .map((link) => link.seniorId),
    );
    // Mismo orden observable que el adaptador real: más reciente primero.
    return [...this.profiles.values()]
      .filter((profile) => seniorIds.has(profile.id))
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || b.id.localeCompare(a.id));
  }

  async findSeniorForCaregiver(
    seniorId: string,
    caregiverId: string,
  ): Promise<SeniorProfileRecord | null> {
    // Como el driver real con un ObjectId, la comparación no distingue
    // mayúsculas: un id de 24 hex en mayúsculas encuentra el mismo perfil.
    const requested = seniorId.toLowerCase();
    const linked = this.links.some(
      (link) =>
        link.status === 'ACTIVE' &&
        link.seniorId.toLowerCase() === requested &&
        link.caregiverId === caregiverId,
    );
    if (!linked) return null;
    return this.profiles.get(requested) ?? null;
  }

  async addCaregiverLink(link: SeniorLinkRecord): Promise<SeniorLinkRecord> {
    this.linkCalls += 1;
    // S3: un vínculo ya existente se devuelve tal cual — sin duplicar y sin
    // tocar los demás, como el upsert del adaptador real.
    const existing = this.links.find(
      (candidate) =>
        candidate.seniorId === link.seniorId && candidate.caregiverId === link.caregiverId,
    );
    if (existing !== undefined) return existing;
    if (this.linkError !== null) throw this.linkError;
    this.links.push(link);
    return link;
  }

  async listCaregiversOfSenior(seniorId: string): Promise<CaregiverSummary[]> {
    // Se agrupan por caregiverId: el primero de cada uno conserva su rol.
    const seen = new Map<string, { role: SeniorLinkRecord['role']; linkedAt: Date }>();
    for (const link of this.links) {
      if (link.status !== 'ACTIVE' || link.seniorId !== seniorId) continue;
      if (seen.has(link.caregiverId)) continue;
      seen.set(link.caregiverId, { role: link.role, linkedAt: link.createdAt });
    }
    const summaries: CaregiverSummary[] = [];
    for (const [id, meta] of seen) {
      const fullName = this.caregiverNames.get(id);
      // Igual que el adaptador real: sin cuenta con nombre, no aparece.
      if (fullName === undefined) continue;
      summaries.push({ id, fullName, role: meta.role, linkedAt: meta.linkedAt });
    }
    return summaries;
  }
}
