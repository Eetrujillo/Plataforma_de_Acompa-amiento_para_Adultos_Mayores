'use strict';

const { ValidationError } = require('../../../shared/errors');

const SOS_STATUS = Object.freeze({ ACTIVE: 'ACTIVE', RESOLVED: 'RESOLVED' });

const MAX_MESSAGE_LENGTH = 280;

function normalizeCoordinate(value, { name, min, max }) {
  const parsed = typeof value === 'string' ? Number.parseFloat(value) : value;

  if (typeof parsed !== 'number' || !Number.isFinite(parsed)) {
    throw new ValidationError(`${name} must be a number`);
  }

  if (parsed < min || parsed > max) {
    throw new ValidationError(`${name} must be between ${min} and ${max}`);
  }

  return parsed;
}

function normalizeAccuracy(accuracy) {
  if (accuracy === undefined || accuracy === null) {
    return null;
  }

  const parsed = typeof accuracy === 'string' ? Number.parseFloat(accuracy) : accuracy;

  if (typeof parsed !== 'number' || !Number.isFinite(parsed) || parsed < 0) {
    throw new ValidationError('accuracy must be a non negative number');
  }

  return parsed;
}

function normalizeMessage(message) {
  if (message === undefined || message === null || message === '') {
    return null;
  }

  if (typeof message !== 'string') {
    throw new ValidationError('message must be a string');
  }

  const normalized = message.trim();

  if (normalized.length > MAX_MESSAGE_LENGTH) {
    throw new ValidationError(`message must be at most ${MAX_MESSAGE_LENGTH} characters`);
  }

  return normalized.length > 0 ? normalized : null;
}

/**
 * SosAlert aggregate: an emergency raised from a senior device with its GPS fix.
 */
class SosAlert {
  constructor({
    id = null,
    seniorId,
    latitude,
    longitude,
    accuracy = null,
    message = null,
    status = SOS_STATUS.ACTIVE,
    createdAt = null,
    resolvedAt = null,
    resolvedBy = null
  }) {
    this.id = id;
    this.seniorId = seniorId;
    this.latitude = latitude;
    this.longitude = longitude;
    this.accuracy = accuracy;
    this.message = message;
    this.status = status;
    this.createdAt = createdAt;
    this.resolvedAt = resolvedAt;
    this.resolvedBy = resolvedBy;
  }

  static trigger({ seniorId, latitude, longitude, accuracy, message }) {
    if (typeof seniorId !== 'string' || seniorId.length === 0) {
      throw new ValidationError('seniorId is required');
    }

    return new SosAlert({
      seniorId,
      latitude: normalizeCoordinate(latitude, { name: 'latitude', min: -90, max: 90 }),
      longitude: normalizeCoordinate(longitude, { name: 'longitude', min: -180, max: 180 }),
      accuracy: normalizeAccuracy(accuracy),
      message: normalizeMessage(message)
    });
  }

  static resolve(alert, { resolvedBy, now = new Date() }) {
    if (alert.status !== SOS_STATUS.ACTIVE) {
      throw new ValidationError('sos alert is already resolved');
    }

    return new SosAlert({
      ...alert,
      status: SOS_STATUS.RESOLVED,
      resolvedAt: now,
      resolvedBy
    });
  }

  isActive() {
    return this.status === SOS_STATUS.ACTIVE;
  }
}

function toPublicSosAlert(alert) {
  if (!alert) {
    return null;
  }

  return {
    id: alert.id,
    seniorId: alert.seniorId,
    latitude: alert.latitude,
    longitude: alert.longitude,
    accuracy: alert.accuracy ?? null,
    message: alert.message ?? null,
    status: alert.status,
    createdAt: alert.createdAt ?? null,
    resolvedAt: alert.resolvedAt ?? null
  };
}

module.exports = { SosAlert, SOS_STATUS, toPublicSosAlert };
