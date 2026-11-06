'use strict';

const { GeneratePairingCode } = require('./application/GeneratePairingCode');
const { LinkSeniorApp } = require('./application/LinkSeniorApp');
const { ListLinkedSeniors } = require('./application/ListLinkedSeniors');
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
    generatePairingCode: new GeneratePairingCode({ pairingRepository, userRepository, config }),
    linkSeniorApp: new LinkSeniorApp({ pairingRepository, userRepository, tokenService }),
    listLinkedSeniors: new ListLinkedSeniors({ userRepository }),
    qrGenerator: new QrGenerator()
  });

  return {
    router: createPairingRouter({ controller, authMiddleware }),
    pairingRepository
  };
}

module.exports = { createPairingModule };
