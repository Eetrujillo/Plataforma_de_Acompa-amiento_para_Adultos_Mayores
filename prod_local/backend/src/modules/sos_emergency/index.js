'use strict';

const { TriggerSosAlert } = require('./application/TriggerSosAlert');
const { ResolveSosAlert } = require('./application/ResolveSosAlert');
const { ListActiveAlerts } = require('./application/ListActiveAlerts');
const { PrismaSosRepository } = require('./infrastructure/PrismaSosRepository');
const { NotificationAdapter } = require('./infrastructure/NotificationAdapter');
const { createSosController } = require('./infrastructure/SosController');
const { createSosRouter } = require('./infrastructure/sosRoutes');

/**
 * SOS emergency slice composition root.
 *
 * The notification channel is injected so the slice stays testable without a
 * live Socket.IO server.
 */
function createSosModule({ prisma, userRepository, authMiddleware, io = null, pushGateway = null }) {
  const sosRepository = new PrismaSosRepository({ prisma });
  const notifier = new NotificationAdapter({ io, pushGateway });

  const controller = createSosController({
    triggerSosAlert: new TriggerSosAlert({ sosRepository, userRepository, notifier }),
    resolveSosAlert: new ResolveSosAlert({ sosRepository, userRepository, notifier }),
    listActiveAlerts: new ListActiveAlerts({ sosRepository, userRepository })
  });

  return {
    router: createSosRouter({ controller, authMiddleware }),
    sosRepository,
    notifier
  };
}

module.exports = { createSosModule };
