'use strict';

const { asyncHandler } = require('../../../shared/middlewares/asyncHandler');

/**
 * Express controller for the pairing slice.
 */
function createPairingController({ generatePairingCode, linkSeniorApp, qrGenerator }) {
  return {
    generate: asyncHandler(async (req, res) => {
      const pairing = await generatePairingCode.execute({ caregiverId: req.user.id });
      const qrCodeDataUrl = await qrGenerator.toDataUrl(pairing.code);

      res.status(201).json({ ...pairing, qrCodeDataUrl });
    }),

    link: asyncHandler(async (req, res) => {
      const result = await linkSeniorApp.execute(req.body);
      res.status(201).json(result);
    })
  };
}

module.exports = { createPairingController };
