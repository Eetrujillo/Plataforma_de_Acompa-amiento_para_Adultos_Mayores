'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { SosAlert, SOS_STATUS } = require('../src/modules/sos_emergency/domain/SosAlert');
const { ValidationError } = require('../src/shared/errors');

const VALID_INPUT = Object.freeze({
  seniorId: 'senior-1',
  latitude: -34.6037,
  longitude: -58.3816,
  accuracy: 12.5,
  message: 'Me caí en el baño'
});

test('triggering an alert keeps the GPS fix and starts active', () => {
  const alert = SosAlert.trigger(VALID_INPUT);

  assert.equal(alert.seniorId, 'senior-1');
  assert.equal(alert.latitude, -34.6037);
  assert.equal(alert.longitude, -58.3816);
  assert.equal(alert.accuracy, 12.5);
  assert.equal(alert.message, 'Me caí en el baño');
  assert.equal(alert.status, SOS_STATUS.ACTIVE);
  assert.equal(alert.isActive(), true);
});

test('coordinates outside the real GPS ranges are rejected', () => {
  assert.throws(
    () => SosAlert.trigger({ ...VALID_INPUT, latitude: 91 }),
    (error) => error instanceof ValidationError && error.message === 'latitude must be between -90 and 90'
  );
  assert.throws(
    () => SosAlert.trigger({ ...VALID_INPUT, longitude: -181 }),
    (error) => error instanceof ValidationError && error.message === 'longitude must be between -180 and 180'
  );
  assert.throws(() => SosAlert.trigger({ ...VALID_INPUT, latitude: 'north' }), ValidationError);
});

test('numeric strings from the device are accepted, empty optional fields become null', () => {
  const alert = SosAlert.trigger({
    seniorId: 'senior-1',
    latitude: '-34.6037',
    longitude: '-58.3816',
    accuracy: null,
    message: '   '
  });

  assert.equal(alert.latitude, -34.6037);
  assert.equal(alert.longitude, -58.3816);
  assert.equal(alert.accuracy, null);
  assert.equal(alert.message, null);
});

test('resolving an active alert stamps status, instant and caregiver', () => {
  const now = new Date('2024-05-01T12:00:00.000Z');
  const resolved = SosAlert.resolve(SosAlert.trigger(VALID_INPUT), { resolvedBy: 'caregiver-1', now });

  assert.equal(resolved.status, SOS_STATUS.RESOLVED);
  assert.equal(resolved.resolvedAt, now);
  assert.equal(resolved.resolvedBy, 'caregiver-1');
  assert.equal(resolved.isActive(), false);
});

test('resolving a resolved alert is rejected', () => {
  const now = new Date('2024-05-01T12:00:00.000Z');
  const resolved = SosAlert.resolve(SosAlert.trigger(VALID_INPUT), { resolvedBy: 'caregiver-1', now });

  assert.throws(
    () => SosAlert.resolve(resolved, { resolvedBy: 'caregiver-1', now }),
    (error) => error instanceof ValidationError && error.message === 'sos alert is already resolved'
  );
});
