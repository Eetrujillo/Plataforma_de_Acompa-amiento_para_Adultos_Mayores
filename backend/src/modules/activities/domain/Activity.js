'use strict';

const { ValidationError } = require('../../../shared/errors');

const ACTIVITY_STATUS = Object.freeze({
  PENDING: 'PENDING',
  COMPLETED: 'COMPLETED',
  SKIPPED: 'SKIPPED'
});

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MIN_TITLE_LENGTH = 3;
const MAX_TITLE_LENGTH = 120;
const MAX_DESCRIPTION_LENGTH = 500;

function normalizeTitle(title) {
  if (typeof title !== 'string') {
    throw new ValidationError('title is required');
  }

  const normalized = title.trim();

  if (normalized.length < MIN_TITLE_LENGTH || normalized.length > MAX_TITLE_LENGTH) {
    throw new ValidationError(
      `title must be between ${MIN_TITLE_LENGTH} and ${MAX_TITLE_LENGTH} characters`
    );
  }

  return normalized;
}

function normalizeDescription(description) {
  if (description === undefined || description === null || description === '') {
    return null;
  }

  if (typeof description !== 'string') {
    throw new ValidationError('description must be a string');
  }

  const normalized = description.trim();

  if (normalized.length > MAX_DESCRIPTION_LENGTH) {
    throw new ValidationError(`description must be at most ${MAX_DESCRIPTION_LENGTH} characters`);
  }

  return normalized.length > 0 ? normalized : null;
}

function normalizeScheduledTime(scheduledTime) {
  if (typeof scheduledTime !== 'string' || !TIME_PATTERN.test(scheduledTime)) {
    throw new ValidationError('scheduledTime must use the HH:mm 24 hour format');
  }

  return scheduledTime;
}

function normalizeScheduledDate(scheduledDate) {
  if (typeof scheduledDate !== 'string' || !DATE_PATTERN.test(scheduledDate)) {
    throw new ValidationError('scheduledDate must use the YYYY-MM-DD format');
  }

  const parsed = new Date(`${scheduledDate}T00:00:00.000Z`);

  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== scheduledDate) {
    throw new ValidationError('scheduledDate is not a real calendar date');
  }

  return scheduledDate;
}

/**
 * Activity aggregate: a routine item for one senior on one day.
 */
class Activity {
  constructor({
    id = null,
    seniorId,
    createdBy,
    title,
    description = null,
    scheduledTime,
    scheduledDate,
    status = ACTIVITY_STATUS.PENDING,
    completedAt = null,
    createdAt = null
  }) {
    this.id = id;
    this.seniorId = seniorId;
    this.createdBy = createdBy;
    this.title = title;
    this.description = description;
    this.scheduledTime = scheduledTime;
    this.scheduledDate = scheduledDate;
    this.status = status;
    this.completedAt = completedAt;
    this.createdAt = createdAt;
  }

  static create({ seniorId, createdBy, title, description, scheduledTime, scheduledDate }) {
    if (typeof seniorId !== 'string' || seniorId.length === 0) {
      throw new ValidationError('seniorId is required');
    }

    if (typeof createdBy !== 'string' || createdBy.length === 0) {
      throw new ValidationError('createdBy is required');
    }

    return new Activity({
      seniorId,
      createdBy,
      title: normalizeTitle(title),
      description: normalizeDescription(description),
      scheduledTime: normalizeScheduledTime(scheduledTime),
      scheduledDate: normalizeScheduledDate(scheduledDate)
    });
  }

  /**
   * Only a pending activity can be completed; repeating the action is invalid.
   */
  static complete(activity, now = new Date()) {
    if (activity.status !== ACTIVITY_STATUS.PENDING) {
      throw new ValidationError(`activity is already ${activity.status.toLowerCase()}`);
    }

    return new Activity({ ...activity, status: ACTIVITY_STATUS.COMPLETED, completedAt: now });
  }

  isCompleted() {
    return this.status === ACTIVITY_STATUS.COMPLETED;
  }
}

function toPublicActivity(activity) {
  if (!activity) {
    return null;
  }

  return {
    id: activity.id,
    seniorId: activity.seniorId,
    title: activity.title,
    description: activity.description ?? null,
    scheduledTime: activity.scheduledTime,
    scheduledDate: activity.scheduledDate,
    status: activity.status,
    completedAt: activity.completedAt ?? null
  };
}

module.exports = {
  Activity,
  ACTIVITY_STATUS,
  toPublicActivity,
  normalizeTitle,
  normalizeScheduledTime,
  normalizeScheduledDate
};
