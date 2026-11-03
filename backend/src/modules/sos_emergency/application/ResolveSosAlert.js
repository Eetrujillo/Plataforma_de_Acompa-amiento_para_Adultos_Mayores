'use strict';

const { SosAlert, toPublicSosAlert } = require('../domain/SosAlert');
const { ForbiddenError, NotFoundError, ValidationError } = require('../../../shared/errors');

/**
 * Resolves an active alert. Only the caregiver linked to that senior may do it.
 *
 * Ports: sosRepository, userRepository, notifier
 */
class ResolveSosAlert {
  constructor({ sosRepository, userRepository, notifier }) {
    this.sosRepository = sosRepository;
    this.userRepository = userRepository;
    this.notifier = notifier;
  }

  async execute({ alertId, caregiverId, now = new Date() } = {}) {
    if (typeof alertId !== 'string' || alertId.length === 0) {
      throw new ValidationError('alertId is required');
    }

    const alert = await this.sosRepository.findById(alertId);

    if (!alert) {
      throw new NotFoundError('sos alert not found');
    }

    const senior = await this.userRepository.findById(alert.seniorId);

    if (!senior || senior.caregiverId !== caregiverId) {
      throw new ForbiddenError('sos alert belongs to another caregiver');
    }

    const resolved = SosAlert.resolve(alert, { resolvedBy: caregiverId, now });

    const updated = await this.sosRepository.resolve({
      id: alert.id,
      resolvedAt: resolved.resolvedAt,
      resolvedBy: resolved.resolvedBy
    });

    const projected = toPublicSosAlert(updated);

    await this.notifier.alertResolved({ alert: projected, caregiverId });

    return projected;
  }
}

module.exports = { ResolveSosAlert };
