import {
  collapseSpaces,
  isValidFullName,
  isValidPhone,
} from '../../../shared/domain/text.ts';

// Las reglas de texto son compartidas: seniors (HU-005/HU-007) valida con las
// mismas funciones, así no hay dos definiciones de "nombre válido".
export { collapseSpaces, isValidFullName, isValidPhone };

export type UserRole = 'CAREGIVER' | 'SENIOR';

/** Evidencia de consentimiento de la Ley 1581 de 2012, fijada por el servidor. */
export interface ConsentEvidence {
  /** Instante exacto de la aceptación (reloj del servidor). */
  acceptedTermsAt: Date;
  /** Versión de la política de tratamiento de datos aceptada (TERMS_VERSION). */
  termsVersion: string;
  /** IP del transporte, solo cuando el pedido la trae. */
  ipAddress?: string;
}

export interface UserCreateInput {
  /** Ya normalizado: minúsculas, sin espacios en los bordes. */
  email: string;
  /** Hash bcrypt, nunca el texto plano. */
  passwordHash: string;
  fullName: string;
  phone?: string;
  role?: UserRole;
  consent: ConsentEvidence;
}

/** Entidad de dominio. La fábrica única `User.create` es la única puerta de alta. */
export interface UserEntity {
  readonly email: string;
  readonly passwordHash: string;
  readonly fullName: string;
  readonly phone?: string;
  readonly role: UserRole;
  readonly consent: ConsentEvidence;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** Mínimo 8 caracteres, con al menos una letra y un dígito (docs/auth-api.md). */
const PASSWORD_PATTERN = /^(?=.*[A-Za-z])(?=.*[0-9]).{8,}$/;

/** Normaliza el correo a minúsculas y sin espacios en los bordes. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isValidEmailFormat(email: string): boolean {
  return EMAIL_PATTERN.test(email);
}

export function isValidPassword(password: string): boolean {
  return PASSWORD_PATTERN.test(password);
}

export function createConsentEvidence(input: {
  termsVersion: string;
  acceptedTermsAt: Date;
  ipAddress?: string;
}): ConsentEvidence {
  const consent: ConsentEvidence = {
    acceptedTermsAt: input.acceptedTermsAt,
    termsVersion: input.termsVersion,
  };
  if (input.ipAddress !== undefined) {
    consent.ipAddress = input.ipAddress;
  }
  return consent;
}

function create(input: UserCreateInput): UserEntity {
  // Invariantes de la fábrica: el caso de uso ya tradujo los errores de negocio;
  // si algo llega mal acá es un bug del caller, no un 400 para el cliente.
  if (!isValidEmailFormat(input.email) || input.email !== normalizeEmail(input.email)) {
    throw new Error('User.create requiere un correo normalizado y con formato válido');
  }
  if (!isValidFullName(input.fullName)) {
    throw new Error('User.create requiere un nombre completo de al menos 3 caracteres');
  }
  if (input.phone !== undefined && !isValidPhone(input.phone)) {
    throw new Error('User.create recibió un teléfono con formato inválido');
  }
  const base: UserEntity = {
    email: input.email,
    passwordHash: input.passwordHash,
    fullName: collapseSpaces(input.fullName),
    role: input.role ?? 'CAREGIVER',
    consent: input.consent,
  };
  const user = input.phone === undefined ? base : { ...base, phone: input.phone };
  return Object.freeze(user);
}

/** Fábrica única de usuarios (profiles-hexagonal). Nunca se construye la entidad por fuera. */
export const User = { create } as const;
