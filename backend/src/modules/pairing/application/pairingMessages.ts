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
