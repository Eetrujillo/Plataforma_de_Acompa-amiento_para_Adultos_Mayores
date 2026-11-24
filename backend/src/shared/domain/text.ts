/**
 * Reglas de texto compartidas por los dos slices que dan de alta personas
 * (auth y seniors). Viven acá y no en el dominio de auth para que el slice de
 * perfiles no dependa del de cuentas: es la misma regla, en un solo lugar.
 */

/** Colapsa espacios internos y recorta los de los bordes. */
export function collapseSpaces(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

/** Un nombre completo necesita al menos 3 caracteres tras normalizar. */
export function isValidFullName(fullName: string): boolean {
  return collapseSpaces(fullName).length >= 3;
}

/** 6 a 20 caracteres: `+`, dígitos, espacios o guiones (docs/auth-api.md). */
const PHONE_PATTERN = /^\+?[0-9\s-]{6,20}$/;

export function isValidPhone(phone: string): boolean {
  return PHONE_PATTERN.test(phone);
}
