'use strict';

const { GeneratePairingCode } = require('./application/GeneratePairingCode');
const { LinkSeniorApp } = require('./application/LinkSeniorApp');
const { PrismaPairingRepository } = require('./infrastructure/PrismaPairingRepository');
const { QrGenerator } = require('./infrastructure/QrGenerator');
const { createPairingController } = require('./infrastructure/PairingController');
const { createPairingRouter } = require('./infrastructure/pairingRoutes');

/**
 * Pairing slice composition root.
 */
function createPairingModule({ prisma, config, userRepository, tokenService, authMiddleware }) {
  const pairingRepository = new PrismaPairingRepository({ prisma });

  const controller = createPairingController({
    generatePairingCode: new GeneratePairingCode({ pairingRepository, config }),
    linkSeniorApp: new LinkSeniorApp({ pairingRepository, userRepository, tokenService }),
    qrGenerator: new QrGenerator()
  });

  return {
    router: createPairingRouter({ controller, authMiddleware }),
    pairingRepository
  };
}

module.exports = { createPairingModule };
