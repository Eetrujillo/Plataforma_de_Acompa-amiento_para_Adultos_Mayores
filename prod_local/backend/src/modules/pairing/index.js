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
  const qrGenerator = new QrGenerator();

  const controller = createPairingController({
    generatePairingCode: new GeneratePairingCode({ pairingRepository, config }),
    linkSeniorApp: new LinkSeniorApp({ pairingRepository, userRepository, tokenService }),
    listLinkedSeniors: new ListLinkedSeniors({ userRepository }),
    qrGenerator
  });

  return {
    router: createPairingRouter({ controller, authMiddleware }),
    pairingRepository,
    qrGenerator
  };
}

module.exports = { createPairingModule };
