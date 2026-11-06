'use strict';

const { asyncHandler } = require('../../../shared/middlewares/asyncHandler');

/** Controlador del canje del código de vinculación (HU-007). */
function createLinkingController({ redeemLinkingCode }) {
  return {
    redeem: asyncHandler(async (req, res) => {
      const result = await redeemLinkingCode.execute({
        code: req.body?.code,
        consentAccepted: req.body?.consentAccepted,
        consentVersion: req.body?.consentVersion,
        ip: req.ip
      });

      res.status(201).json(result);
    })
  };
}

module.exports = { createLinkingController };
