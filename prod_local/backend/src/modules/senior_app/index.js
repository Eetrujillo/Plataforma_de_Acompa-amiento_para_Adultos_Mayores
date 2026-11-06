'use strict';

const { SeniorAppService } = require('./application/SeniorAppService');
const { createSeniorAppController } = require('./infrastructure/SeniorAppController');
const { createSeniorAppRouter } = require('./infrastructure/seniorAppRoutes');

/** Composition root del slice `senior_app`. */
function createSeniorAppModule({ olderAdultRepository, activityRepository, passwordHasher, seniorAuthMiddleware }) {
  const seniorAppService = new SeniorAppService({
    olderAdultRepository,
    activityRepository,
    passwordHasher
  });

  const controller = createSeniorAppController({ seniorAppService });

  return {
    router: createSeniorAppRouter({ controller, seniorAuthMiddleware }),
    service: seniorAppService,
    seniorAppService
  };
}

module.exports = { createSeniorAppModule };
