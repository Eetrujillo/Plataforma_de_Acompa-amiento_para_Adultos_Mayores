import type { NextFunction, Request, Response } from 'express';
import { AppError } from '../../../shared/errors/AppError.ts';
import { INVALID_SESSION_MESSAGE } from '../../../shared/middlewares/authMiddleware.ts';
import { CreateSeniorProfile } from '../application/CreateSeniorProfile.ts';
import { GetSeniorMedicalRecord } from '../application/GetSeniorMedicalRecord.ts';
import { GetSeniorProfile } from '../application/GetSeniorProfile.ts';
import { ListSeniorCaregivers } from '../application/ListSeniorCaregivers.ts';
import { ListSeniorProfiles } from '../application/ListSeniorProfiles.ts';
import { toPublicSenior } from '../domain/seniorProfile.ts';

export interface SeniorsUseCases {
  createSeniorProfile: CreateSeniorProfile;
  listSeniorProfiles: ListSeniorProfiles;
  getSeniorProfile: GetSeniorProfile;
  getSeniorMedicalRecord: GetSeniorMedicalRecord;
  listSeniorCaregivers: ListSeniorCaregivers;
}

/** Mensaje de INVALID_BODY; `details.field` marca el campo que falló la forma. */
const INVALID_BODY_MESSAGE = 'El cuerpo del pedido no tiene el formato esperado';

function bodyObject(body: unknown): Record<string, unknown> {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    throw new AppError(400, 'INVALID_BODY', INVALID_BODY_MESSAGE);
  }
  return body as Record<string, unknown>;
}

function invalidBody(field: string): AppError {
  return new AppError(400, 'INVALID_BODY', INVALID_BODY_MESSAGE, { field });
}

/** Lista de texto: ausente es `[]`; presente, array de strings o INVALID_BODY. */
function textList(raw: Record<string, unknown>, field: string): string[] {
  const value = raw[field];
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    throw invalidBody(field);
  }
  return value as string[];
}

function sessionCaregiverId(req: Request): string {
  // S14: el caregiverId sale de la sesión, nunca del cuerpo del pedido.
  const user = req.sessionUser;
  if (user === undefined) {
    throw new AppError(401, 'UNAUTHORIZED', INVALID_SESSION_MESSAGE);
  }
  return user.id;
}

/**
 * Arma el comando del alta desde el cuerpo crudo. Acá sólo se decide la FORMA
 * (tipos, arrays, contactos); las reglas de negocio (nombre corto, zona
 * IANA, enumeración de grupo sanguíneo, límites de las listas) son del caso
 * de uso, que responde con un código por campo (S16/S18).
 */
function buildCreateCommand(req: Request): {
  caregiverId: string;
  fullName: string;
  timezone: string | null;
  bloodType: string;
  allergies: string[];
  conditions: string[];
  medications: string[];
  emergencyContact: { fullName: string; phone: string };
} {
  const raw = bodyObject(req.body);
  // S18: el nombre que falta o no es texto lo marca el caso de uso como
  // INVALID_NAME — por eso llega vacío y no como INVALID_BODY.
  const rawFullName = raw['fullName'];
  const timezone = raw['timezone'];
  if (typeof timezone !== 'string' && timezone !== null && timezone !== undefined) {
    throw invalidBody('timezone');
  }
  const bloodType = raw['bloodType'];
  if (typeof bloodType !== 'string') throw invalidBody('bloodType');
  const emergencyContact = raw['emergencyContact'];
  if (
    emergencyContact === null ||
    typeof emergencyContact !== 'object' ||
    Array.isArray(emergencyContact) ||
    typeof (emergencyContact as Record<string, unknown>)['fullName'] !== 'string' ||
    typeof (emergencyContact as Record<string, unknown>)['phone'] !== 'string'
  ) {
    throw invalidBody('emergencyContact');
  }
  const contact = emergencyContact as { fullName: string; phone: string };
  return {
    caregiverId: sessionCaregiverId(req),
    // S18: falta o no es texto → '' → INVALID_NAME del caso de uso.
    fullName: typeof rawFullName === 'string' ? rawFullName : '',
    // S17: ausente o `null` es "sin zona": el caso de uso cae a Bogotá.
    timezone: typeof timezone === 'string' ? timezone : null,
    bloodType,
    allergies: textList(raw, 'allergies'),
    conditions: textList(raw, 'conditions'),
    medications: textList(raw, 'medications'),
    emergencyContact: { fullName: contact.fullName, phone: contact.phone },
  };
}

function seniorIdOf(req: Request): string {
  // El router declara ':id'; si viniera vacío, es un id malformado y responde
  // el mismo 404 de siempre (S19) — no delata la forma del pedido.
  return typeof req.params['id'] === 'string' ? req.params['id'] : '';
}

/** Controlador HTTP del slice seniors (HU-005/HU-007). */
export function createSeniorController(useCases: SeniorsUseCases) {
  return {
    // Express 4 no propaga los rechazos de handlers async: se capturan y se
    // delegan al errorHandler explícitamente.
    async create(req: Request, res: Response, next: NextFunction): Promise<void> {
      try {
        const command = buildCreateCommand(req);
        const senior = await useCases.createSeniorProfile.execute(command);
        // S22: la respuesta del alta es exactamente la proyección pública —
        // sin ficha médica, sin correos sintéticos ni consentimiento.
        res.status(201).json(toPublicSenior(senior));
      } catch (error: unknown) {
        next(error);
      }
    },

    async list(req: Request, res: Response, next: NextFunction): Promise<void> {
      try {
        // S14: la lista se acota por la sesión; el cuerpo no participa.
        const seniors = await useCases.listSeniorProfiles.execute({
          caregiverId: sessionCaregiverId(req),
        });
        // S21: sin perfiles es 200 con `{seniors: []}`, no un 404.
        res.status(200).json({ seniors: seniors.map(toPublicSenior) });
      } catch (error: unknown) {
        next(error);
      }
    },

    async get(req: Request, res: Response, next: NextFunction): Promise<void> {
      try {
        const senior = await useCases.getSeniorProfile.execute({
          seniorId: seniorIdOf(req),
          caregiverId: sessionCaregiverId(req),
        });
        res.status(200).json(senior);
      } catch (error: unknown) {
        next(error);
      }
    },

    async medical(req: Request, res: Response, next: NextFunction): Promise<void> {
      try {
        const record = await useCases.getSeniorMedicalRecord.execute({
          seniorId: seniorIdOf(req),
          caregiverId: sessionCaregiverId(req),
        });
        res.status(200).json(record);
      } catch (error: unknown) {
        next(error);
      }
    },

    async caregivers(req: Request, res: Response, next: NextFunction): Promise<void> {
      try {
        const caregivers = await useCases.listSeniorCaregivers.execute({
          seniorId: seniorIdOf(req),
          caregiverId: sessionCaregiverId(req),
        });
        // S4: los N familiares del perfil, con rol informativo, sólo para
        // quien tiene vínculo.
        res.status(200).json({ caregivers });
      } catch (error: unknown) {
        next(error);
      }
    },
  };
}
