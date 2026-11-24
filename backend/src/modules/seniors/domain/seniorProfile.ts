/**
 * HU-005/HU-007 — perfil del adulto mayor: reglas puras, ficha médica y
 * proyecciones. El perfil es un documento de la colección `users` con
 * `role: 'SENIOR'`, sin correo propio ni credenciales (S8, S15).
 */
import { randomUUID } from 'node:crypto';

import { collapseSpaces, isValidPhone } from '../../../shared/domain/text.ts';

/** Enumeración cerrada del grupo sanguíneo (S16). */
export const BLOOD_TYPES = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'] as const;
export type BloodType = (typeof BLOOD_TYPES)[number];

/** El vínculo con el dispositivo se gana con el QR (HU-008/HU-009); el alta nunca lo marca. */
export type LinkStatus = 'PENDING' | 'LINKED';

export const DEFAULT_TIMEZONE = 'America/Bogota';
export const MAX_FULL_NAME_LENGTH = 120;
export const MAX_LIST_ITEMS = 20;
export const MAX_LIST_ITEM_LENGTH = 80;
const MIN_NAME_LENGTH = 3;
/** Dominio de los correos sintéticos: nadie los escribe ni los recibe. */
const SYNTHETIC_EMAIL_DOMAIN = 'seniors.local';

export interface EmergencyContact {
  readonly fullName: string;
  readonly phone: string;
}

/** Ficha médica del adulto mayor: la única parte sensible del perfil (S7, S11). */
export interface SeniorMedicalRecord {
  readonly bloodType: BloodType;
  readonly allergies: readonly string[];
  readonly conditions: readonly string[];
  readonly medications: readonly string[];
  readonly emergencyContact: EmergencyContact;
}

export interface SeniorProfileCreateInput extends SeniorMedicalRecord {
  readonly fullName: string;
  /** Opcional: si falta, viene vacía o `null`, se guarda `America/Bogota` (S17). */
  readonly timezone?: string | null;
}

/** Lo que la fábrica entrega para persistir: los campos del documento `User`. */
export interface SeniorProfileDocument extends SeniorMedicalRecord {
  readonly email: string;
  readonly passwordHash: null;
  readonly fullName: string;
  readonly role: 'SENIOR';
  readonly timezone: string;
  readonly linkStatus: 'PENDING';
  /** S12: el familiar administra pero no consiente por el titular (Ley 1581). */
  readonly acceptedTermsAt: null;
  readonly termsVersion: null;
}

/** El perfil ya persistido: lo único que las proyecciones necesitan. */
export interface SeniorProfileRecord extends SeniorMedicalRecord {
  readonly id: string;
  readonly fullName: string;
  readonly timezone: string;
  readonly linkStatus: LinkStatus;
  readonly createdAt: Date;
}

/** Proyección pública por lista blanca (S11): nunca la ficha médica. */
export interface PublicSenior {
  readonly id: string;
  readonly fullName: string;
  readonly timezone: string;
  readonly linkStatus: LinkStatus;
  readonly createdAt: Date;
}

export function normalizeFullName(raw: string): string {
  return collapseSpaces(raw);
}

export function isValidSeniorFullName(raw: string): boolean {
  const name = normalizeFullName(raw);
  return name.length >= MIN_NAME_LENGTH && name.length <= MAX_FULL_NAME_LENGTH;
}

/** Zona por defecto solo cuando el valor falta; una zona inventada se rechaza aparte (S17). */
export function resolveTimezone(raw: string | null | undefined): string {
  const candidate = raw?.trim() ?? '';
  return candidate === '' ? DEFAULT_TIMEZONE : candidate;
}

/** Valida contra la base IANA del runtime: una zona inventada no se vuelve Bogotá (S17). */
export function isValidTimezone(value: string): boolean {
  const candidate = value.trim();
  if (candidate === '') return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: candidate });
    return true;
  } catch {
    return false;
  }
}

export function isBloodType(value: unknown): value is BloodType {
  return typeof value === 'string' && (BLOOD_TYPES as readonly string[]).includes(value);
}

export function normalizeTextList(raw: readonly string[]): string[] {
  return raw.map((item) => item.trim());
}

/** Listas acotadas: máximo 20 ítems de 1 a 80 caracteres cada uno (S16). */
export function isValidTextList(raw: readonly string[]): boolean {
  if (raw.length > MAX_LIST_ITEMS) return false;
  return raw.every((item) => {
    if (typeof item !== 'string') return false;
    const trimmed = item.trim();
    return trimmed.length >= 1 && trimmed.length <= MAX_LIST_ITEM_LENGTH;
  });
}

export function isValidEmergencyContactName(raw: string): boolean {
  const name = normalizeFullName(raw);
  return name.length >= MIN_NAME_LENGTH && name.length <= MAX_FULL_NAME_LENGTH;
}

export function isValidEmergencyContactPhone(raw: string): boolean {
  return isValidPhone(raw.trim());
}

/** S15: `senior+<uuid12>@seniors.local`, único por perfil. */
export function syntheticSeniorEmail(): string {
  const suffix = randomUUID().replace(/-/g, '').slice(0, 12);
  return `senior+${suffix}@${SYNTHETIC_EMAIL_DOMAIN}`;
}

function assertProfile(input: SeniorProfileCreateInput): void {
  // Invariantes de la fábrica: el caso de uso ya tradujo los errores de negocio
  // a AppError; si algo llega mal acá es un bug del caller (mismo criterio que
  // `User.create` en el slice de auth).
  if (!isValidSeniorFullName(input.fullName)) {
    throw new Error('createSenior requiere un nombre de 3 a 120 caracteres tras normalizar');
  }
  const timezone = resolveTimezone(input.timezone);
  if (!isValidTimezone(timezone)) {
    throw new Error(`createSenior recibió la zona horaria inválida "${timezone}"`);
  }
  if (!isBloodType(input.bloodType)) {
    throw new Error('createSenior requiere un grupo sanguíneo de la enumeración cerrada');
  }
  const lists: readonly [string, readonly string[]][] = [
    ['allergies', input.allergies],
    ['conditions', input.conditions],
    ['medications', input.medications],
  ];
  for (const [field, list] of lists) {
    if (!isValidTextList(list)) {
      throw new Error(`createSenior recibió la lista ${field} fuera de los límites`);
    }
  }
  if (
    !isValidEmergencyContactName(input.emergencyContact.fullName) ||
    !isValidEmergencyContactPhone(input.emergencyContact.phone)
  ) {
    throw new Error('createSenior recibió un contacto de emergencia inválido');
  }
}

/**
 * S13: única fábrica del perfil. El alta del panel y el canje del dispositivo
 * pasan por acá, así una regla nueva del perfil cambia en los dos caminos.
 */
export function createSenior(input: SeniorProfileCreateInput): SeniorProfileDocument {
  assertProfile(input);
  const senior: SeniorProfileDocument = {
    email: syntheticSeniorEmail(),
    passwordHash: null,
    fullName: normalizeFullName(input.fullName),
    role: 'SENIOR',
    timezone: resolveTimezone(input.timezone),
    linkStatus: 'PENDING',
    acceptedTermsAt: null,
    termsVersion: null,
    bloodType: input.bloodType,
    allergies: Object.freeze(normalizeTextList(input.allergies)),
    conditions: Object.freeze(normalizeTextList(input.conditions)),
    medications: Object.freeze(normalizeTextList(input.medications)),
    emergencyContact: Object.freeze({
      fullName: normalizeFullName(input.emergencyContact.fullName),
      phone: input.emergencyContact.phone.trim(),
    }),
  };
  return Object.freeze(senior);
}

/** S11: la única forma en que un perfil sale del backend por la vista pública. */
export function toPublicSenior(record: SeniorProfileRecord): PublicSenior {
  return {
    id: record.id,
    fullName: record.fullName,
    timezone: record.timezone,
    linkStatus: record.linkStatus,
    createdAt: record.createdAt,
  };
}

/**
 * S7/S11: la ficha médica es la otra vista. Que solo la reciba un familiar
 * vinculado se resuelve en el caso de uso; acá se decide qué se expone.
 */
export function toSeniorMedicalRecord(record: SeniorProfileRecord): SeniorMedicalRecord {
  return {
    bloodType: record.bloodType,
    allergies: record.allergies,
    conditions: record.conditions,
    medications: record.medications,
    emergencyContact: record.emergencyContact,
  };
}
