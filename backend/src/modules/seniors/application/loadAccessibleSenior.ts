import { AppError } from '../../../shared/errors/AppError.ts';
import { isObjectIdHex } from '../domain/seniorLink.ts';
import type { SeniorProfileRecord } from '../domain/seniorProfile.ts';
import type { SeniorRepositoryPort } from './SeniorRepositoryPort.ts';

/** S19: un solo mensaje para ajeno, inexistente y malformado. */
export const SENIOR_NOT_FOUND_MESSAGE = 'No encontramos ese perfil';

/** El 404 canónico del slice: nota que no delata por qué falló. */
export function seniorNotFoundError(): AppError {
  return new AppError(404, 'SENIOR_NOT_FOUND', SENIOR_NOT_FOUND_MESSAGE);
}

/**
 * Propiedad del perfil, resuelta por parámetro y nunca desde `req` (S5/S10):
 * el caso de uso recibe ambos ids y consulta el repositorio autorizado por
 * vínculo. Un id que no son 24 hexadecimales se rechaza ANTES de tocar el
 * repositorio: llegaría al driver como ObjectId inválido y sería un 500,
 * no el 404 prometido. Ninguna rama distingue ajeno / inexistente / malformado.
 */
export async function loadAccessibleSenior(
  seniorRepository: SeniorRepositoryPort,
  seniorId: string,
  caregiverId: string,
): Promise<SeniorProfileRecord> {
  if (!isObjectIdHex(seniorId)) throw seniorNotFoundError();
  const senior = await seniorRepository.findSeniorForCaregiver(seniorId, caregiverId);
  if (senior === null) throw seniorNotFoundError();
  return senior;
}
