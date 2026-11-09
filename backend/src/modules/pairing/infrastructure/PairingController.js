'use strict';

const { asyncHandler } = require('../../../shared/middlewares/asyncHandler');

/**
 * Express controller for the pairing slice.
 */
function createPairingController({ generatePairingToken, redeemPairingToken, listLinkedSeniors }) {
  return {
    seniors: asyncHandler(async (req, res) => {
      const result = await listLinkedSeniors.execute({ caregiverId: req.user.id });
      res.status(200).json(result);
    }),

    generateQr: asyncHandler(async (req, res) => {
      // HU-006 S3: el QR pertenece a un perfil. El cuidador sale de la sesión, el perfil del
      // cuerpo, y el caso de uso verifica que sea suyo y que siga pendiente. El QR se arma ahí
      // mismo: si el codificador falla, la respuesta es un 503 antes de tocar ningún token.
      const pairing = await generatePairingToken.execute({
        caregiverId: req.user.id,
        seniorId: req.body?.seniorId
      });

      // Sin el token: la única copia en claro viaja dentro de la imagen.
      res.status(201).json(pairing);
    }),

    redeem: asyncHandler(async (req, res) => {
      const result = await redeemPairingToken.execute(req.body);
      res.status(201).json(result);
    })
  };
}

module.exports = { createPairingController };
