'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  activityOccursOnDate,
  dayStatus,
  occurrenceInstant,
  resolveCompletionInstant,
  validateActivityInput
} = require('../src/modules/activities/domain/activityRules');

const baseActivity = {
  id: 'a1',
  seniorId: 's1',
  createdBy: 'c1',
  title: 'Medicina',
  scheduledDate: '2026-11-05',
  scheduledTime: '08:00',
  timeZone: 'America/Bogota',
  repeatType: 'once',
  weekdays: [],
  active: true,
  deletedAt: null
};

test('una actividad de una sola vez solo ocurre en su fecha', () => {
  assert.equal(activityOccursOnDate(baseActivity, '2026-11-05'), true);
  assert.equal(activityOccursOnDate(baseActivity, '2026-11-06'), false);
  assert.equal(activityOccursOnDate(baseActivity, '2026-11-04'), false);
});

test('una actividad diaria no ocurre antes de su fecha de inicio', () => {
  const daily = { ...baseActivity, repeatType: 'daily' };

  assert.equal(activityOccursOnDate(daily, '2026-11-04'), false);
  assert.equal(activityOccursOnDate(daily, '2026-11-05'), true);
  assert.equal(activityOccursOnDate(daily, '2026-12-01'), true);
});

test('una actividad semanal respeta los días marcados (0 = domingo)', () => {
  // 2026-11-05 es jueves (4); 2026-11-08 es domingo (0).
  const weekly = { ...baseActivity, repeatType: 'weekly', weekdays: [0, 4] };

  assert.equal(activityOccursOnDate(weekly, '2026-11-05'), true);
  assert.equal(activityOccursOnDate(weekly, '2026-11-06'), false);
  assert.equal(activityOccursOnDate(weekly, '2026-11-08'), true);
});

test('una actividad eliminada o inactiva no ocurre', () => {
  assert.equal(activityOccursOnDate({ ...baseActivity, active: false }, '2026-11-05'), false);
  assert.equal(
    activityOccursOnDate({ ...baseActivity, deletedAt: new Date() }, '2026-11-05'),
    false
  );
});

test('la ocurrencia de una actividad repetida conserva la hora de la primera', () => {
  const daily = { ...baseActivity, repeatType: 'daily' };
  const instant = occurrenceInstant(daily, '2026-11-07');

  // 08:00 en Bogotá (UTC-5) = 13:00 UTC, sin importar el día.
  assert.equal(instant.toISOString(), '2026-11-07T13:00:00.000Z');
});

test('HU-020: el estado es completada, vencida o pendiente', () => {
  const now = new Date('2026-11-05T10:00:00.000Z');
  const expiresAt = new Date('2026-11-05T09:30:00.000Z');

  assert.equal(dayStatus({ completed: true, expiresAt, now }), 'completed');
  assert.equal(dayStatus({ completed: false, expiresAt, now }), 'expired');

  const future = new Date('2026-11-05T10:30:00.000Z');
  assert.equal(dayStatus({ completed: false, expiresAt: future, now }), 'pending');
});

test('HU-019: se acepta la hora pasada y se rechaza un futuro mayor a 10 minutos', () => {
  const now = new Date('2026-11-05T15:00:00.000Z');

  assert.equal(resolveCompletionInstant('2026-11-05T14:55:00.000Z', now).toISOString(), '2026-11-05T14:55:00.000Z');
  assert.equal(resolveCompletionInstant('2026-11-05T15:05:00.000Z', now).toISOString(), '2026-11-05T15:05:00.000Z');

  assert.throws(() => resolveCompletionInstant('2026-11-05T15:30:00.000Z', now), (error) => {
    assert.equal(error.code, 'COMPLETION_TIME_INVALID');
    return true;
  });
});

test('HU-012: el título vacío o demasiado largo se rechaza con el campo', () => {
  const base = {
    title: ' ',
    icon: 'medicina',
    date: '2026-12-01',
    time: '09:00',
    repeatType: 'once',
    timeZone: 'America/Bogota',
    now: new Date('2026-11-05T12:00:00.000Z')
  };

  assert.throws(() => validateActivityInput(base), (error) => {
    assert.equal(error.code, 'ACTIVITY_TITLE_REQUIRED');
    assert.equal(error.details.field, 'title');
    return true;
  });

  assert.throws(
    () => validateActivityInput({ ...base, title: 'x'.repeat(61) }),
    (error) => error.code === 'ACTIVITY_TITLE_TOO_LONG'
  );
});

test('HU-013: una repetición semanal exige al menos un día', () => {
  assert.throws(
    () =>
      validateActivityInput({
        title: 'Caminar',
        icon: 'paseo',
        date: '2026-12-01',
        time: '09:00',
        repeatType: 'weekly',
        weekdays: [],
        timeZone: 'America/Bogota',
        now: new Date('2026-11-05T12:00:00.000Z')
      }),
    (error) => error.code === 'ACTIVITY_WEEKDAYS_REQUIRED'
  );
});

test('HU-012: una fecha pasada exige confirmación explícita', () => {
  const input = {
    title: 'Cita',
    icon: 'cita',
    date: '2026-01-01',
    time: '09:00',
    repeatType: 'once',
    timeZone: 'America/Bogota',
    now: new Date('2026-11-05T12:00:00.000Z')
  };

  assert.throws(() => validateActivityInput(input), (error) => {
    assert.equal(error.code, 'ACTIVITY_PAST_REQUIRES_CONFIRMATION');
    assert.equal(error.details.field, 'scheduledAt');
    return true;
  });

  const values = validateActivityInput({ ...input, confirmPast: true });
  assert.equal(values.title, 'Cita');
  assert.equal(values.repeatType, 'once');
});
