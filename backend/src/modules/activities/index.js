'use strict';

const { CreateActivity } = require('./application/CreateActivity');
const { GetDailyRoutine } = require('./application/GetDailyRoutine');
const { MarkCompleted } = require('./application/MarkCompleted');
const { PrismaActivityRepository } = require('./infrastructure/PrismaActivityRepository');
const { createActivitiesController } = require('./infrastructure/ActivitiesController');
const { createActivitiesRouter } = require('./infrastructure/activitiesRoutes');

/**
 * Activities slice composition root.
 */
function createActivitiesModule({ prisma, userRepository, authMiddleware }) {
  const activityRepository = new PrismaActivityRepository({ prisma });

  const controller = createActivitiesController({
    createActivity: new CreateActivity({ activityRepository, userRepository }),
    getDailyRoutine: new GetDailyRoutine({ activityRepository, userRepository }),
    markCompleted: new MarkCompleted({ activityRepository })
  });

  return {
    router: createActivitiesRouter({ controller, authMiddleware }),
    activityRepository
  };
}

module.exports = { createActivitiesModule };
