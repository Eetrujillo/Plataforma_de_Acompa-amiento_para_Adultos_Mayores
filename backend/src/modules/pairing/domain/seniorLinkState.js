'use strict';

const { toPublicUser } = require('../../auth/domain/User');
const { DEFAULT_TIMEZONE, LINK_STATUS } = require('../../seniors/domain/seniorProfile');

/**
 * Estado de vinculación de un perfil (HU-005, reusado por HU-006 S3/S5).
 *
 * Sólo un `PENDING` explícito cuenta como pendiente. Un documento escrito antes de HU-005 no
 * trae `linkStatus` y lo creó el flujo de vinculación, así que un valor ausente significa
 * vinculado. Vive acá y no en cada caso de uso porque la misma regla decide qué perfiles
 * aparecen en el selector y para cuáles se puede emitir un código.
 */
function isPendingLinkStatus(linkStatus) {
  return typeof linkStatus === 'string' && linkStatus.toUpperCase() === LINK_STATUS.PENDING;
}

/**
 * Payload del senior en la respuesta del canje (HU-006 S5, corregido en L5).
 *
 * Conserva la proyección que ya consume la app publicada (`toPublicUser`: id, email, fullName,
 * role, phone, caregiverId, emailVerified, createdAt) y le suma `linkStatus` y `timezone` de
 * forma aditiva. No se usa la proyección estricta de HU-005 acá porque le quitaría campos a un
 * cliente desplegado; esa proyección es la de `GET /api/seniors`.
 */
function toLinkedSeniorPayload(user) {
  if (!user) {
    return null;
  }

  return {
    ...toPublicUser(user),
    linkStatus: user.linkStatus ?? LINK_STATUS.LINKED,
    timezone: user.timezone ?? DEFAULT_TIMEZONE
  };
}

module.exports = { isPendingLinkStatus, toLinkedSeniorPayload };
