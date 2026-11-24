import { SeniorLinkModel } from '../../../shared/models/SeniorLink.ts';
import { UserModel } from '../../../shared/models/User.ts';
import { DEFAULT_TIMEZONE, isBloodType } from '../domain/seniorProfile.ts';
import type {
  BloodType,
  EmergencyContact,
  LinkStatus,
  SeniorProfileDocument,
  SeniorProfileRecord,
} from '../domain/seniorProfile.ts';
import { createOwnerLink, isActiveLink } from '../domain/seniorLink.ts';
import type { SeniorLinkRecord, SeniorLinkRole, SeniorLinkStatus } from '../domain/seniorLink.ts';
import type { CaregiverSummary, SeniorRepositoryPort } from '../application/SeniorRepositoryPort.ts';

/** Documento leído de la colección `users` con la forma que el mapeo necesita. */
interface PersistedSenior {
  _id: { toString(): string };
  fullName: string;
  // Opcionales: `lean()` tipa como ausentes los campos con `default` en el schema.
  timezone?: string | null;
  linkStatus?: string | null;
  bloodType?: string | null;
  allergies?: readonly string[] | null;
  conditions?: readonly string[] | null;
  medications?: readonly string[] | null;
  emergencyContact?: { fullName: string; phone: string } | null;
  createdAt: Date;
}

interface PersistedLink {
  seniorId: { toString(): string };
  caregiverId: { toString(): string };
  role: string;
  status: string;
  invitedBy?: { toString(): string } | null;
  createdAt: Date;
}

const DUPLICATE_KEY = 11000;

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === DUPLICATE_KEY
  );
}

/**
 * Un perfil sin ficha médica válida sólo puede venir de una escritura hecha
 * por fuera de este adaptador (la fábrica la exige). Se falla ruidosamente en
 * vez de inventar un grupo sanguíneo: mentir acá es peor que responder 500.
 */
function requiredMedicalFields(doc: PersistedSenior): {
  bloodType: BloodType;
  emergencyContact: EmergencyContact;
} {
  const { bloodType, emergencyContact } = doc;
  if (!isBloodType(bloodType) || emergencyContact === null || emergencyContact === undefined) {
    throw new Error(`El perfil ${doc._id.toString()} no tiene ficha médica válida`);
  }
  return { bloodType, emergencyContact };
}

/** Mapeo del documento al registro del dominio (exportado para los pines del adaptador). */
export function mapSeniorProfile(doc: PersistedSenior): SeniorProfileRecord {
  const medical = requiredMedicalFields(doc);
  const linkStatus: LinkStatus = doc.linkStatus === 'LINKED' ? 'LINKED' : 'PENDING';
  return {
    id: doc._id.toString(),
    fullName: doc.fullName,
    timezone: doc.timezone ?? DEFAULT_TIMEZONE,
    linkStatus,
    createdAt: doc.createdAt,
    bloodType: medical.bloodType,
    allergies: doc.allergies ?? [],
    conditions: doc.conditions ?? [],
    medications: doc.medications ?? [],
    emergencyContact: medical.emergencyContact,
  };
}

/**
 * Lectura robusta: un documento `SENIOR` sin ficha válida (escrito a mano o
 * por una versión anterior del modelo) no puede tumbar la lista entera de los
 * demás. En lectura se omite; en el detalle eso equivale a inexistente, el
 * 404 que el contrato ya promete para todo lo que no se puede ver. La fábrica
 * sigue exigiendo la ficha, así que ninguna escritura del backend produce un
 * documento así.
 */
function tryMapSeniorProfile(doc: PersistedSenior): SeniorProfileRecord | null {
  try {
    return mapSeniorProfile(doc);
  } catch {
    return null;
  }
}

export function mapSeniorLink(doc: PersistedLink): SeniorLinkRecord {
  return {
    seniorId: doc.seniorId.toString(),
    caregiverId: doc.caregiverId.toString(),
    role: doc.role as SeniorLinkRole,
    status: doc.status as SeniorLinkStatus,
    invitedBy: doc.invitedBy === null || doc.invitedBy === undefined ? null : doc.invitedBy.toString(),
    createdAt: doc.createdAt,
  };
}

function toLinkDocument(link: SeniorLinkRecord): Record<string, unknown> {
  return {
    seniorId: link.seniorId,
    caregiverId: link.caregiverId,
    role: link.role,
    status: link.status,
    invitedBy: link.invitedBy,
    createdAt: link.createdAt,
  };
}

/** Adaptador Mongoose del slice seniors (colecciones `users` y `seniorlinks`). */
export function createMongooseSeniorRepository(): SeniorRepositoryPort {
  return {
    async createSeniorProfile(
      profile: SeniorProfileDocument,
      ownerCaregiverId: string,
      linkedAt: Date,
    ): Promise<SeniorProfileRecord> {
      const created = await UserModel.create({ ...profile });
      const ownerLink = createOwnerLink({
        seniorId: created._id.toString(),
        caregiverId: ownerCaregiverId,
        createdAt: linkedAt,
      });
      // D4: sin transacción. Si esta escritura falla, el perfil queda sin
      // vínculo: nadie lo puede listar, abrir ni reclamar, así que el fallo es
      // inerte (falla cerrado) y el alta se reintenta entera.
      await SeniorLinkModel.create(toLinkDocument(ownerLink));
      return mapSeniorProfile(created.toObject());
    },

    async listSeniorsForCaregiver(caregiverId: string): Promise<SeniorProfileRecord[]> {
      const links = await SeniorLinkModel.find({ caregiverId, status: 'ACTIVE' }, { seniorId: 1 })
        .lean();
      const seniorIds = links.map((link) => link.seniorId);
      if (seniorIds.length === 0) return [];
      const docs = await UserModel.find({ _id: { $in: seniorIds }, role: 'SENIOR' })
        .sort({ createdAt: -1, _id: -1 })
        .lean();
      return docs.flatMap((doc) => {
        const senior = tryMapSeniorProfile(doc);
        return senior === null ? [] : [senior];
      });
    },

    async findSeniorForCaregiver(
      seniorId: string,
      caregiverId: string,
    ): Promise<SeniorProfileRecord | null> {
      const link = await SeniorLinkModel.findOne(
        { seniorId, caregiverId, status: 'ACTIVE' },
        { _id: 1 },
      ).lean();
      if (link === null) return null;
      const doc = await UserModel.findOne({ _id: seniorId, role: 'SENIOR' }).lean();
      return doc === null ? null : tryMapSeniorProfile(doc);
    },

    async addCaregiverLink(link: SeniorLinkRecord): Promise<SeniorLinkRecord> {
      if (!isActiveLink(link)) {
        throw new Error('Solo se agregan vínculos activos');
      }
      try {
        const stored = await SeniorLinkModel.findOneAndUpdate(
          { seniorId: link.seniorId, caregiverId: link.caregiverId },
          { $setOnInsert: toLinkDocument(link) },
          { upsert: true, new: true, setDefaultsOnInsert: true },
        ).lean();
        if (stored === null) throw new Error('No se pudo registrar el vínculo');
        return mapSeniorLink(stored);
      } catch (error: unknown) {
        // Dos altas simultáneas del mismo familiar: la segunda pierde el
        // upsert contra el índice único y se resuelve leyendo el vínculo que
        // la primera dejó. Nunca se duplica ni se revoca (S3).
        if (!isDuplicateKeyError(error)) throw error;
        const existing = await SeniorLinkModel.findOne({
          seniorId: link.seniorId,
          caregiverId: link.caregiverId,
        }).lean();
        if (existing === null) throw error;
        return mapSeniorLink(existing);
      }
    },

    async listCaregiversOfSenior(seniorId: string): Promise<CaregiverSummary[]> {
      const links = await SeniorLinkModel.find(
        { seniorId, status: 'ACTIVE' },
        { caregiverId: 1, role: 1, createdAt: 1 },
      )
        .sort({ createdAt: 1, _id: 1 })
        .lean();
      if (links.length === 0) return [];
      const ids = links.map((link) => link.caregiverId);
      const users = await UserModel.find(
        { _id: { $in: ids }, role: 'CAREGIVER' },
        { fullName: 1 },
      ).lean();
      const nameById = new Map(users.map((user) => [user._id.toString(), user.fullName]));
      return links.flatMap((link) => {
        const id = link.caregiverId.toString();
        const fullName = nameById.get(id);
        if (fullName === undefined) return [];
        return [
          {
            id,
            fullName,
            role: link.role as SeniorLinkRole,
            linkedAt: link.createdAt,
          },
        ];
      });
    },
  };
}
