'use strict';

const { ManageOlderAdults } = require('./application/ManageOlderAdults');
const { PrismaOlderAdultRepository } = require('./infrastructure/PrismaOlderAdultRepository');
const { createOlderAdultController } = require('./infrastructure/OlderAdultController');
const { createOlderAdultRouter } = require('./infrastructure/olderAdultRoutes');

/**
 * Composition root del slice `older_adults`.
 *
 * Recibe del slice de autenticación el hasher (el mismo bcrypt del resto de la
 * app) y del de pairing el repositorio de códigos y el generador de QR.
 */
function createOlderAdultsModule({
  prisma,
  config,
  authMiddleware,
  verifiedEmailGuard,
  passwordHasher,
  pairingRepository,
  qrGenerator
}) {
  const olderAdultRepository = new PrismaOlderAdultRepository({ prisma });

  const manageOlderAdults = new ManageOlderAdults({
    olderAdultRepository,
    pairingRepository,
    passwordHasher,
    qrGenerator,
    config
  });

  const controller = createOlderAdultController({ manageOlderAdults });

  return {
    router: createOlderAdultRouter({ controller, authMiddleware, verifiedEmailGuard }),
    olderAdultRepository
  };
}

module.exports = { createOlderAdultsModule };
