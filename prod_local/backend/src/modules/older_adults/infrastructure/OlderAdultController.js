'use strict';

const { asyncHandler } = require('../../../shared/middlewares/asyncHandler');

/** Controlador HTTP de los perfiles del adulto mayor. */
function createOlderAdultController({ manageOlderAdults }) {
  return {
    list: asyncHandler(async (req, res) => {
      res.status(200).json(await manageOlderAdults.list({ caregiverId: req.user.id }));
    }),

    get: asyncHandler(async (req, res) => {
      res.status(200).json(
        await manageOlderAdults.get({ caregiverId: req.user.id, id: req.params.id })
      );
    }),

    create: asyncHandler(async (req, res) => {
      const result = await manageOlderAdults.create({
        caregiverId: req.user.id,
        name: req.body?.name,
        pin: req.body?.pin,
        timeZone: req.body?.timeZone
      });

      res.status(201).json(result);
    }),

    update: asyncHandler(async (req, res) => {
      res.status(200).json(
        await manageOlderAdults.update({
          caregiverId: req.user.id,
          id: req.params.id,
          name: req.body?.name,
          pin: req.body?.pin,
          timeZone: req.body?.timeZone
        })
      );
    }),

    generateLinkingCode: asyncHandler(async (req, res) => {
      res.status(201).json(
        await manageOlderAdults.generateLinkingCode({
          caregiverId: req.user.id,
          id: req.params.id
        })
      );
    }),

    unlink: asyncHandler(async (req, res) => {
      res.status(200).json(
        await manageOlderAdults.unlink({ caregiverId: req.user.id, id: req.params.id })
      );
    })
  };
}

module.exports = { createOlderAdultController };
