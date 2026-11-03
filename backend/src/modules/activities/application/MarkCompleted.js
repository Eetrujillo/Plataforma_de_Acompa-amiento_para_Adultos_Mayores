'use strict';

const { Activity, toPublicActivity } = require('../domain/Activity');
const { ForbiddenError, NotFoundError, ValidationError } = require('../../../shared/errors');

/**
 * Marks an activity completed from the senior device.
 *
 * Ports: activityRepository
 */
class MarkCompleted {
  constructor({ activityRepository }) {
    this.activityRepository = activityRepository;
  }

  async execute({ activityId, seniorId, now = new Date() } = {}) {
    if (typeof activityId !== 'string' || activityId.length === 0) {
      throw new ValidationError('activityId is required');
    }

    const activity = await this.activityRepository.findById(activityId);

    if (!activity) {
      throw new NotFoundError('activity not found');
    }

    if (activity.seniorId !== seniorId) {
      throw new ForbiddenError('activity belongs to another senior');
    }

    const completed = Activity.complete(activity, now);

    const updated = await this.activityRepository.updateStatus({
      id: activity.id,
      status: completed.status,
      completedAt: completed.completedAt
    });

    return toPublicActivity(updated);
  }
}

module.exports = { MarkCompleted };
