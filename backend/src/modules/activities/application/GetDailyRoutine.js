'use strict';

const { toPublicActivity } = require('../domain/Activity');
const { ForbiddenError, NotFoundError, ValidationError } = require('../../../shared/errors');
const { ROLES } = require('../../auth/domain/User');

function todayAsIsoDate(now = new Date()) {
  return now.toISOString().slice(0, 10);
}

/**
 * Returns the routine of one senior for one day, with a progress summary.
 *
 * A senior may only read their own routine; a caregiver only the routines of the
 * seniors linked to their account.
 *
 * Ports: activityRepository, userRepository
 */
class GetDailyRoutine {
  constructor({ activityRepository, userRepository }) {
    this.activityRepository = activityRepository;
    this.userRepository = userRepository;
  }

  async execute({ seniorId, date, requester } = {}) {
    if (typeof seniorId !== 'string' || seniorId.length === 0) {
      throw new ValidationError('seniorId is required');
    }

    const senior = await this.userRepository.findById(seniorId);

    if (!senior) {
      throw new NotFoundError('senior not found');
    }

    if (requester?.role === ROLES.SENIOR && requester.id !== seniorId) {
      throw new ForbiddenError('a senior can only read their own routine');
    }

    if (requester?.role === ROLES.CAREGIVER && senior.caregiverId !== requester.id) {
      throw new ForbiddenError('senior is not linked to this caregiver');
    }

    const scheduledDate = date || todayAsIsoDate();
    const activities = await this.activityRepository.findBySeniorAndDate({ seniorId, scheduledDate });
    const projected = activities.map(toPublicActivity);
    const completed = projected.filter((activity) => activity.status === 'COMPLETED').length;

    return {
      date: scheduledDate,
      activities: projected,
      progress: { total: projected.length, completed }
    };
  }
}

module.exports = { GetDailyRoutine, todayAsIsoDate };
