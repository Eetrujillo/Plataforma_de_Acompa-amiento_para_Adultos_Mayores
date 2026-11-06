'use strict';

const { RedeemLinkingCode } = require('./application/RedeemLinkingCode');
const { PrismaLinkAttemptRepository } = require('./infrastructure/PrismaLinkAttemptRepository');
const { createLinkingController } = require('./infrastructure/LinkingController');
const { createLinkingRouter } = require('./infrastructure/linkingRoutes');

/** Composition root del slice `linking`. */
function createLinkingModule({ pairingRepository, olderAdultRepository, tokenService }) {
  const linkAttemptRepository = new PrismaLinkAttemptRepository({
    prisma: olderAdultRepository.prisma
  });

  const controller = createLinkingController({
    redeemLinkingCode: new RedeemLinkingCode({
      pairingRepository,
      olderAdultRepository,
      linkAttemptRepository,
      tokenService
    })
  });

  return { router: createLinkingRouter({ controller }) };
}

module.exports = { createLinkingModule };
