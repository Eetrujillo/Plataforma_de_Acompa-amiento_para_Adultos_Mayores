'use strict';

const { asyncHandler } = require('../../../shared/middlewares/asyncHandler');

/**
 * Express controller for the activities slice.
 */
function createActivitiesController({ createActivity, getDailyRoutine, markCompleted }) {  return {
    create: asyncHandler(async (req, res) => {
      const activity = await createActivity.execute({
        caregiverId: req.user.id,
        seniorId: req.body.seniorId,
        title: req.body.title,
        description: req.body.description,
        scheduledTime: req.body.scheduledTime,
        scheduledDate: req.body.scheduledDate
      });

      res.status(201).json({ activity });
    }),

    daily: asyncHandler(async (req, res) => {
      const routine = await getDailyRoutine.execute({
        seniorId: req.query.seniorId || req.user.id,
        date: req.query.date,
        requester: req.user
      });

      res.status(200).json(routine);
    }),

    complete: asyncHandler(async (req, res) => {
      const activity = await markCompleted.execute({
        activityId: req.params.id,
        seniorId: req.user.id
      });

      res.status(200).json({ activity });
    })
  };
}

module.exports = { createActivitiesController };
