/**
 * HU-005 — vínculo adulto mayor ↔ familiar. La colección de vínculos es la
 * única fuente de propiedad: `User.caregiverId` dejó de existir (decisión D1
 * de odd/tasks/hu-005-seniors-vinculos.md).
 */

/** Informativo: el rol no cambia permisos (S2). */
export type SeniorLinkRole = 'OWNER' | 'FAMILY';

/** Solo un vínculo activo autoriza; revocar es desactivar, nunca borrar (S3). */
export type SeniorLinkStatus = 'ACTIVE' | 'REVOKED';

export interface SeniorLinkRecord {
  readonly seniorId: string;
  readonly caregiverId: string;
  readonly role: SeniorLinkRole;
  readonly status: SeniorLinkStatus;
  /** Quién agregó el vínculo; `null` en el alta del panel. */
  readonly invitedBy: string | null;
  readonly createdAt: Date;
}

export interface OwnerLinkInput {
  readonly seniorId: string;
  readonly caregiverId: string;
  readonly createdAt: Date;
}

export interface FamilyLinkInput extends OwnerLinkInput {
  readonly invitedBy: string;
}

/** S1: el alta del panel deja el primer vínculo, el del familiar que lo creó. */
export function createOwnerLink(input: OwnerLinkInput): SeniorLinkRecord {
  return Object.freeze({
    seniorId: input.seniorId,
    caregiverId: input.caregiverId,
    role: 'OWNER' as const,
    status: 'ACTIVE' as const,
    invitedBy: null,
    createdAt: input.createdAt,
  });
}

/** S1/S3: el segundo familiar entra como FAMILY y no toca los vínculos existentes. */
export function createFamilyLink(input: FamilyLinkInput): SeniorLinkRecord {
  return Object.freeze({
    seniorId: input.seniorId,
    caregiverId: input.caregiverId,
    role: 'FAMILY' as const,
    status: 'ACTIVE' as const,
    invitedBy: input.invitedBy,
    createdAt: input.createdAt,
  });
}

export function isActiveLink(link: SeniorLinkRecord): boolean {
  return link.status === 'ACTIVE';
}

/**
 * S2: OWNER y FAMILY autorizan igual. `links` son los de un solo adulto mayor;
 * filtrarlos es responsabilidad de la consulta.
 */
export function canCaregiverAccessSenior(
  links: readonly SeniorLinkRecord[],
  caregiverId: string,
): boolean {
  return links.some((link) => isActiveLink(link) && link.caregiverId === caregiverId);
}

/** S1: los N familiares vinculados, sin repetir. */
export function linkedCaregiverIds(links: readonly SeniorLinkRecord[]): string[] {
  const ids = links.filter(isActiveLink).map((link) => link.caregiverId);
  return [...new Set(ids)];
}

/** S19: un id que no es un ObjectId no llega al driver (sería un 500, no el 404 prometido). */
export function isObjectIdHex(value: string): boolean {
  return /^[0-9a-fA-F]{24}$/.test(value);
}
