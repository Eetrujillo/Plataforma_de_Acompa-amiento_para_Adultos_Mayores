'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { Activity, ACTIVITY_STATUS } = require('../src/modules/activities/domain/Activity');
const { ValidationError } = require('../src/shared/errors');

const VALID_INPUT = Object.freeze({
  seniorId: 'senior-1',
  createdBy: 'caregiver-1',
  title: '  Tomar la medicación  ',
  description: 'Con el desayuno',
  scheduledTime: '08:30',
  scheduledDate: '2024-05-01'
});

test('creating an activity normalizes the title and starts pending', () => {
  const activity = Activity.create(VALID_INPUT);

  assert.equal(activity.title, 'Tomar la medicación');
  assert.equal(activity.description, 'Con el desayuno');
  assert.equal(activity.scheduledTime, '08:30');
  assert.equal(activity.scheduledDate, '2024-05-01');
  assert.equal(activity.status, ACTIVITY_STATUS.PENDING);
  assert.equal(activity.completedAt, null);
});

test('a scheduled time must use the padded 24 hour HH:mm format', () => {
  assert.throws(
    () => Activity.create({ ...VALID_INPUT, scheduledTime: '9:00' }),
    (error) => error instanceof ValidationError && error.message === 'scheduledTime must use the HH:mm 24 hour format'
  );
  assert.throws(() => Activity.create({ ...VALID_INPUT, scheduledTime: '24:00' }), ValidationError);
});

test('a scheduled date must be a real calendar date', () => {
  assert.throws(
    () => Activity.create({ ...VALID_INPUT, scheduledDate: '2024-02-30' }),
    (error) => error instanceof ValidationError && error.message === 'scheduledDate is not a real calendar date'
  );
  assert.throws(() => Activity.create({ ...VALID_INPUT, scheduledDate: '01-05-2024' }), ValidationError);
});

test('completing a pending activity stamps the completion instant', () => {
  const now = new Date('2024-05-01T08:45:00.000Z');
  const completed = Activity.complete(Activity.create(VALID_INPUT), now);

  assert.equal(completed.status, ACTIVITY_STATUS.COMPLETED);
  assert.equal(completed.completedAt, now);
});

test('completing an already completed activity is rejected and keeps the original status', () => {
  const now = new Date('2024-05-01T08:45:00.000Z');
  const completed = Activity.complete(Activity.create(VALID_INPUT), now);

  assert.throws(
    () => Activity.complete(completed, now),
    (error) => error instanceof ValidationError && error.message === 'activity is already completed'
  );
  assert.equal(completed.status, ACTIVITY_STATUS.COMPLETED);
});
