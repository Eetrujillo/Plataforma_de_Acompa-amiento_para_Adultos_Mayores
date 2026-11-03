'use strict';

const { asyncHandler } = require('../../../shared/middlewares/asyncHandler');

/**
 * Express controller for the pairing slice.
 */
function createPairingController({ generatePairingCode, linkSeniorApp, listLinkedSeniors, qrGenerator }) {
  return {
    seniors: asyncHandler(async (req, res) => {
      const result = await listLinkedSeniors.execute({ caregiverId: req.user.id });
      res.status(200).json(result);
    }),

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
