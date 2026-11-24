/**
 * HU-008 — los mensajes que el panel del cuidador muestra (S12/D8).
 *
 * Viven fuera del caso de uso porque también los usa el adaptador del
 * codificador (D9: traduce el fallo a 503) y los dobles de los tests: si
 * estuvieran en el caso de uso, la infraestructura dependería de la aplicación
 * por una cadena de texto.
 */

/** S12: falta `seniorId` o no tiene forma de id de Mongo. */
export const SENIOR_ID_REQUIRED_MESSAGE = 'Falta el perfil del adulto mayor para generar el QR';

/** S3/S18: el perfil ya figura vinculado (o no consta su vínculo). */
export const SENIOR_ALREADY_LINKED_MESSAGE = 'El perfil ya está vinculado a un dispositivo';

/** S4/S13: no hay imagen, no hay credencial. */
export const PAIRING_QR_UNAVAILABLE_MESSAGE =
  'No pudimos generar el código QR, intenta de nuevo en un momento';

// ─── HU-009: los mensajes del canje (S15/D12) ──────────────────────────────

/** S14/S15: vencido e invalidado comparten el mismo texto genérico, en inglés. */
export const PAIRING_TOKEN_INVALID_MESSAGE = 'pairing token is invalid or expired';

/** S14/S15: bien formado pero desconocido, en inglés. */
export const PAIRING_TOKEN_NOT_FOUND_MESSAGE = 'pairing token not found';

/** S14/S15: ya canjeado (el de la carrera perdida usa el mismo), en inglés. */
export const PAIRING_TOKEN_ALREADY_USED_MESSAGE = 'pairing token already used';

/**
 * D3/S15/ley-1581 §4: el consentimiento del titular es obligatorio. El mismo
 * código (`TERMS_NOT_ACCEPTED`) y el mismo campo (`acceptedTerms`) que el
 * registro del familiar; el texto es del canje porque la bandera autoriza el
 * vínculo del dispositivo.
 */
export const REDEEM_TERMS_NOT_ACCEPTED_MESSAGE =
  'Debés aceptar la política de tratamiento de datos para vincular el dispositivo';
