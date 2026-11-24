import { AppError } from '../../../shared/errors/AppError.ts';
import {
  createSenior,
  isValidSeniorFullName,
  isValidTextList,
  isValidTimezone,
  isBloodType,
  isValidEmergencyContactName,
  isValidEmergencyContactPhone,
} from '../domain/seniorProfile.ts';
import type { SeniorProfileRecord } from '../domain/seniorProfile.ts';
import type { SeniorRepositoryPort } from './SeniorRepositoryPort.ts';

/** Comando del alta: todos los campos ya tipados por el controlador. */
export interface CreateSeniorCommand {
  /** S14: sale de la sesión; el controlador nunca lo toma del cuerpo. */
  readonly caregiverId: string;
  readonly fullName: string;
  readonly timezone: string | null;
  readonly bloodType: string;
  readonly allergies: readonly string[];
  readonly conditions: readonly string[];
  readonly medications: readonly string[];
  readonly emergencyContact: { readonly fullName: string; readonly phone: string };
}

/** S18: los errores son por campo, para que la pantalla marque dónde está el problema. */
export const INVALID_NAME_MESSAGE = 'El nombre debe tener entre 3 y 120 caracteres';
export const INVALID_TIMEZONE_MESSAGE = 'La zona horaria no es una zona IANA válida';
export const INVALID_BLOOD_TYPE_MESSAGE =
  'El grupo sanguíneo debe ser uno de A+, A-, B+, B-, AB+, AB-, O+, O-';
export const INVALID_ALLERGIES_MESSAGE =
  'Las alergias deben ser entre 0 y 20 ítems de 1 a 80 caracteres';
export const INVALID_CONDITIONS_MESSAGE =
  'Las condiciones deben ser entre 0 y 20 ítems de 1 a 80 caracteres';
export const INVALID_MEDICATIONS_MESSAGE =
  'La medicación debe ser entre 0 y 20 ítems de 1 a 80 caracteres';
export const INVALID_EMERGENCY_CONTACT_MESSAGE =
  'El contacto de emergencia necesita un nombre y un teléfono válidos';

/**
 * Alta del perfil del adulto mayor (HU-007). Valida la ficha antes de
 * escribir (S16), compone el documento por la única fábrica `createSenior`
 * (S13) y deja el vínculo OWNER con quien dio el alta (S1/D4): el orden
 * perfil-primero lo impone el puerto, no este caso de uso.
 */
export class CreateSeniorProfile {
  private readonly seniorRepository: SeniorRepositoryPort;
  private readonly clock: { now(): Date };

  constructor(deps: { seniorRepository: SeniorRepositoryPort; clock: { now(): Date } }) {
    this.seniorRepository = deps.seniorRepository;
    this.clock = deps.clock;
  }

  async execute(command: CreateSeniorCommand): Promise<SeniorProfileRecord> {
    // S18: nombre falta, no es texto o queda corto — un solo INVALID_NAME.
    if (typeof command.fullName !== 'string' || !isValidSeniorFullName(command.fullName)) {
      throw new AppError(400, 'INVALID_NAME', INVALID_NAME_MESSAGE);
    }
    // S17: la zona por defecto es válida; un valor con contenido se verifica
    // tal cual — inventar una zona no se cae a Bogotá en silencio.
    if (
      typeof command.timezone === 'string' &&
      command.timezone.trim() !== '' &&
      !isValidTimezone(command.timezone)
    ) {
      throw new AppError(400, 'INVALID_TIMEZONE', INVALID_TIMEZONE_MESSAGE);
    }
    // S16: grupo sanguíneo de enumeración cerrada.
    const bloodType = command.bloodType;
    if (!isBloodType(bloodType)) {
      throw new AppError(400, 'INVALID_BLOOD_TYPE', INVALID_BLOOD_TYPE_MESSAGE);
    }
    // S16: listas acotadas, máx 20 ítems de 1 a 80 caracteres.
    if (!isValidTextList(command.allergies)) {
      throw new AppError(400, 'INVALID_ALLERGIES', INVALID_ALLERGIES_MESSAGE);
    }
    if (!isValidTextList(command.conditions)) {
      throw new AppError(400, 'INVALID_CONDITIONS', INVALID_CONDITIONS_MESSAGE);
    }
    if (!isValidTextList(command.medications)) {
      throw new AppError(400, 'INVALID_MEDICATIONS', INVALID_MEDICATIONS_MESSAGE);
    }
    if (
      typeof command.emergencyContact !== 'object' ||
      command.emergencyContact === null ||
      !isValidEmergencyContactName(command.emergencyContact.fullName) ||
      !isValidEmergencyContactPhone(command.emergencyContact.phone)
    ) {
      throw new AppError(400, 'INVALID_EMERGENCY_CONTACT', INVALID_EMERGENCY_CONTACT_MESSAGE);
    }
    const senior = createSenior({ ...command, bloodType });
    // El reloj entra por inyección: el `createdAt` del alta es determinista en
    // tests y real en producción.
    return this.seniorRepository.createSeniorProfile(
      senior,
      command.caregiverId,
      this.clock.now(),
    );
  }
}
