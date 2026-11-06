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
      // HU-006 S3: el código pertenece a un perfil. El cuidador sale de la sesión, el perfil
      // del cuerpo, y el caso de uso verifica que sea suyo y que siga pendiente.
      const pairing = await generatePairingCode.execute({
        caregiverId: req.user.id,
        seniorId: req.body?.seniorId
      });
      // El QR es un atajo, no la credencial: si falla se responde igual el código, que ya está
      // emitido y con el anterior invalidado. Un 500 acá dejaría al familiar sin código y sin QR.
      const qrCodeDataUrl = await qrGenerator.toDataUrl(pairing.code).catch(() => null);

      res.status(201).json({ ...pairing, qrCodeDataUrl });
    }),

    link: asyncHandler(async (req, res) => {
      const result = await linkSeniorApp.execute(req.body);
      res.status(201).json(result);
    })
  };
}

module.exports = { createPairingController };
