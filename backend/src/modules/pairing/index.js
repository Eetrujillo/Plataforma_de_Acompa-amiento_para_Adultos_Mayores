'use strict';

const { GeneratePairingToken } = require('./application/GeneratePairingToken');
const { RedeemPairingToken } = require('./application/RedeemPairingToken');
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
    generatePairingToken: new GeneratePairingToken({
      pairingRepository,
      userRepository,
      qrGenerator: new QrGenerator(),
      config
    }),
    redeemPairingToken: new RedeemPairingToken({ pairingRepository, userRepository, tokenService }),
    listLinkedSeniors: new ListLinkedSeniors({ userRepository })
  });

  return {
    router: createPairingRouter({ controller, authMiddleware }),
    pairingRepository
  };
}

module.exports = { createPairingModule };
