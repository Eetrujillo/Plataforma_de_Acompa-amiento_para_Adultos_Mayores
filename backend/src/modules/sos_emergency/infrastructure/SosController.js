'use strict';

const { asyncHandler } = require('../../../shared/middlewares/asyncHandler');

/**
 * Express controller for the sos_emergency slice.
 */
function createSosController({ triggerSosAlert, resolveSosAlert, listActiveAlerts }) {
  return {
    trigger: asyncHandler(async (req, res) => {
      const alert = await triggerSosAlert.execute({
        seniorId: req.user.id,
        latitude: req.body.latitude,
        longitude: req.body.longitude,
        accuracy: req.body.accuracy,
        message: req.body.message
      });

      res.status(201).json({ alert });
    }),

    resolve: asyncHandler(async (req, res) => {
      const alert = await resolveSosAlert.execute({
        alertId: req.params.id,
        caregiverId: req.user.id
      });

      res.status(200).json({ alert });
    }),

    active: asyncHandler(async (req, res) => {
      const result = await listActiveAlerts.execute({ caregiverId: req.user.id });
      res.status(200).json(result);
    })
  };
}

module.exports = { createSosController };
