'use strict';

const { CreateActivity } = require('./application/CreateActivity');
const { GetDailyRoutine } = require('./application/GetDailyRoutine');
const { MarkCompleted } = require('./application/MarkCompleted');
const { ManageActivities } = require('./application/ManageActivities');
const { PrismaActivityRepository } = require('./infrastructure/PrismaActivityRepository');
const { createActivitiesController } = require('./infrastructure/ActivitiesController');
const { createActivitiesRouter } = require('./infrastructure/activitiesRoutes');

/**
 * Composition root del slice `activities`.
 *
 * Mantiene los casos de uso originales de `prod` y añade la gestión completa de
 * la rutina (CRUD y estado del día) de la versión anterior.
 */
function createActivitiesModule({
  prisma,
  userRepository,
  olderAdultRepository,
  activityRepository = null,
  dayBuilder,
  authMiddleware,
  verifiedEmailGuard
}) {
  const repository = activityRepository ?? new PrismaActivityRepository({ prisma });

  const controller = createActivitiesController({
    createActivity: new CreateActivity({ activityRepository: repository, userRepository }),
    getDailyRoutine: new GetDailyRoutine({ activityRepository: repository, userRepository }),
    markCompleted: new MarkCompleted({ activityRepository: repository }),
    manageActivities: new ManageActivities({
      activityRepository: repository,
      olderAdultRepository,
      dayBuilder
    })
  });

  return {
    router: createActivitiesRouter({ controller, authMiddleware, verifiedEmailGuard }),
    activityRepository: repository
  };
}

module.exports = { createActivitiesModule };
