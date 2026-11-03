'use strict';

const { Activity, toPublicActivity } = require('../domain/Activity');
const { ForbiddenError, NotFoundError } = require('../../../shared/errors');

/**
 * Creates a routine item for a senior owned by the requesting caregiver.
 *
 * Ports: activityRepository, userRepository
 */
class CreateActivity {
  constructor({ activityRepository, userRepository }) {
    this.activityRepository = activityRepository;
    this.userRepository = userRepository;
  }

  async execute({ caregiverId, seniorId, title, description, scheduledTime, scheduledDate } = {}) {
    const senior = await this.userRepository.findById(seniorId);

    if (!senior) {
      throw new NotFoundError('senior not found');
    }

    if (senior.caregiverId !== caregiverId) {
      throw new ForbiddenError('senior is not linked to this caregiver');
    }

    const activity = Activity.create({
      seniorId,
      createdBy: caregiverId,
      title,
      description,
      scheduledTime,
      scheduledDate
    });

    const created = await this.activityRepository.create({
      seniorId: activity.seniorId,
      createdBy: activity.createdBy,
      title: activity.title,
      description: activity.description,
      scheduledTime: activity.scheduledTime,
      scheduledDate: activity.scheduledDate,
      status: activity.status
    });

    return toPublicActivity(created);
  }
}

module.exports = { CreateActivity };
