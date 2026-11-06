'use strict';

const { asyncHandler } = require('../../../shared/middlewares/asyncHandler');

/**
 * Express controller for the seniors slice.
 *
 * The owner is always `req.user.id`: the body never carries it.
 */
function createSeniorProfileController({ createSeniorProfile, listSeniorProfiles, getSeniorProfile }) {
  return {
    create: asyncHandler(async (req, res) => {
      const senior = await createSeniorProfile.execute({
        caregiverId: req.user.id,
        fullName: req.body?.fullName,
        pin: req.body?.pin,
        timezone: req.body?.timezone
      });

      res.status(201).json(senior);
    }),

    list: asyncHandler(async (req, res) => {
      const result = await listSeniorProfiles.execute({ caregiverId: req.user.id });
      res.status(200).json(result);
    }),

    get: asyncHandler(async (req, res) => {
      const senior = await getSeniorProfile.execute({
        caregiverId: req.user.id,
        seniorId: req.params.id
      });

      res.status(200).json(senior);
    })
  };
}

module.exports = { createSeniorProfileController };
