'use strict';

const { asyncHandler } = require('../../../shared/middlewares/asyncHandler');

/** Controlador de la app del adulto mayor. */
function createSeniorAppController({ seniorAppService }) {
  return {
    getConsent: asyncHandler(async (_req, res) => {
      res.status(200).json(await seniorAppService.getConsent());
    }),

    session: asyncHandler(async (req, res) => {
      res.status(200).json(await seniorAppService.getSession({ seniorId: req.senior.id }));
    }),

    acceptConsent: asyncHandler(async (req, res) => {
      res.status(200).json(
        await seniorAppService.acceptConsent({
          seniorId: req.senior.id,
          consentVersion: req.body?.consentVersion,
          accepted: req.body?.accepted
        })
      );
    }),

    activities: asyncHandler(async (req, res) => {
      res.status(200).json(
        await seniorAppService.listDay({ seniorId: req.senior.id, date: req.query.date })
      );
    }),

    complete: asyncHandler(async (req, res) => {
      res.status(200).json(
        await seniorAppService.complete({
          seniorId: req.senior.id,
          activityId: req.params.id,
          date: req.body?.date,
          completedAt: req.body?.completedAt
        })
      );
    }),

    undo: asyncHandler(async (req, res) => {
      res.status(200).json(
        await seniorAppService.undo({
          seniorId: req.senior.id,
          activityId: req.params.id,
          date: req.query.date
        })
      );
    }),

    logout: asyncHandler(async (req, res) => {
      res.status(200).json(
        await seniorAppService.logout({ seniorId: req.senior.id, pin: req.body?.pin })
      );
    })
  };
}

module.exports = { createSeniorAppController };
