'use strict';

const { AppError } = require('../../../shared/errors');
const {
  combineDateAndTime,
  compareDateKeys,
  formatRepeatSummary,
  parseDateKey,
  parseTimeKey,
  weekdayFromDateKey
} = require('../../../shared/utils/dateTime');

/**
 * Reglas de la rutina (HU-012 a HU-020).
 *
 * Este archivo es dominio puro: no conoce Prisma ni Express. Se puede probar con
 * `node --test` sin base de datos, igual que el `dayStatus` original.
 */

const ACTIVITY_ICONS = Object.freeze([
  { key: 'medicina', label: 'Medicina', emoji: '💊' },
  { key: 'comida', label: 'Comida', emoji: '🍽️' },
  { key: 'ejercicio', label: 'Ejercicio', emoji: '🏃' },
  { key: 'cita', label: 'Cita médica', emoji: '📅' },
  { key: 'paseo', label: 'Paseo', emoji: '🌳' },
  { key: 'otro', label: 'Otro', emoji: '⭐' }
]);

const ACTIVITY_ICON_KEYS = Object.freeze(ACTIVITY_ICONS.map((icon) => icon.key));
const REPEAT_TYPES = Object.freeze(['once', 'daily', 'weekly']);
const DEFAULT_TIME_ZONE = 'America/Bogota';

/** HU-020: minutos de gracia antes de marcar una ocurrencia como vencida. */
const EXPIRATION_GRACE_MINUTES = 30;
const EXPIRATION_GRACE_MS = EXPIRATION_GRACE_MINUTES * 60 * 1000;

/**
 * HU-019: la marca puede llegar desde el celular después de un rato sin
 * conexión, así que el cliente envía la hora real del toque. Solo se tolera un
 * desfase pequeño hacia el futuro; una hora pasada se acepta tal cual.
 */
const COMPLETION_CLOCK_SKEW_MS = 10 * 60 * 1000;

const MESSAGES = Object.freeze({
  titleRequired: 'Ingresa el título de la actividad.',
  titleTooLong: 'El título no puede superar los 60 caracteres.',
  iconRequired: 'Selecciona un ícono para la actividad.',
  iconInvalid: 'Selecciona un ícono válido.',
  dateRequired: 'Selecciona la fecha de la actividad.',
  timeRequired: 'Selecciona la hora de la actividad.',
  dateTimeInvalid: 'La fecha o la hora no son válidas.',
  repeatInvalid: 'Selecciona una repetición válida.',
  weekdaysRequired: 'Marca al menos un día de la semana.',
  pastRequiresConfirmation:
    'La fecha y hora ya pasaron. Confirma que deseas guardarla o corrige los datos.'
});

function fail(field, code, message) {
  throw new AppError(message, { statusCode: 400, code, details: { field } });
}

function getActivityIcon(key) {
  return ACTIVITY_ICONS.find((icon) => icon.key === key) ?? ACTIVITY_ICONS[ACTIVITY_ICONS.length - 1];
}

function normalizeWeekdays(value) {
  if (!Array.isArray(value)) return [];

  return [...new Set(value.map(Number).filter((day) => Number.isInteger(day) && day >= 0 && day <= 6))].sort(
    (left, right) => left - right
  );
}

/**
 * Valida el formulario del familiar. Devuelve los valores normalizados o lanza
 * un `AppError` con `details.field` para que la interfaz resalte el campo.
 */
function validateActivityInput({
  title,
  icon,
  date,
  time,
  repeatType,
  weekdays,
  confirmPast,
  timeZone,
  now = new Date(),
  previousScheduledAt = null
}) {
  const normalizedTitle = typeof title === 'string' ? title.trim() : '';
  const normalizedRepeat = repeatType || 'once';
  const normalizedWeekdays = normalizeWeekdays(weekdays);
  const zone = timeZone || DEFAULT_TIME_ZONE;

  if (!normalizedTitle) fail('title', 'ACTIVITY_TITLE_REQUIRED', MESSAGES.titleRequired);
  if (normalizedTitle.length > 60) fail('title', 'ACTIVITY_TITLE_TOO_LONG', MESSAGES.titleTooLong);

  if (!icon) fail('icon', 'ACTIVITY_ICON_REQUIRED', MESSAGES.iconRequired);
  if (!ACTIVITY_ICON_KEYS.includes(icon)) {
    fail('icon', 'ACTIVITY_ICON_INVALID', MESSAGES.iconInvalid);
  }

  if (!date) fail('date', 'ACTIVITY_DATE_REQUIRED', MESSAGES.dateRequired);
  if (!time) fail('time', 'ACTIVITY_TIME_REQUIRED', MESSAGES.timeRequired);
  if (!parseDateKey(date) || !parseTimeKey(time)) {
    fail('date', 'ACTIVITY_DATE_TIME_INVALID', MESSAGES.dateTimeInvalid);
  }

  if (!REPEAT_TYPES.includes(normalizedRepeat)) {
    fail('repeatType', 'ACTIVITY_REPEAT_INVALID', MESSAGES.repeatInvalid);
  }

  if (normalizedRepeat === 'weekly' && normalizedWeekdays.length === 0) {
    fail('weekdays', 'ACTIVITY_WEEKDAYS_REQUIRED', MESSAGES.weekdaysRequired);
  }

  const scheduledAt = combineDateAndTime(date, time, zone);
  if (!scheduledAt) fail('date', 'ACTIVITY_DATE_TIME_INVALID', MESSAGES.dateTimeInvalid);

  const previousTime = previousScheduledAt instanceof Date ? previousScheduledAt.getTime() : null;
  const isSameMoment = previousTime !== null && scheduledAt.getTime() === previousTime;

  if (scheduledAt.getTime() <= now.getTime() && !confirmPast && !isSameMoment) {
    throw new AppError(MESSAGES.pastRequiresConfirmation, {
      statusCode: 400,
      code: 'ACTIVITY_PAST_REQUIRES_CONFIRMATION',
      details: { field: 'scheduledAt', scheduledAt }
    });
  }

  return {
    title: normalizedTitle,
    icon,
    date,
    time,
    timeZone: zone,
    repeatType: normalizedRepeat,
    weekdays: normalizedRepeat === 'weekly' ? normalizedWeekdays : [],
    scheduledAt
  };
}

function isActive(activity) {
  return activity.active !== false && !activity.deletedAt;
}

function timeZoneOf(activity) {
  return activity.timeZone || DEFAULT_TIME_ZONE;
}

/** Instante absoluto de una ocurrencia concreta de la actividad. */
function occurrenceInstant(activity, dateKey) {
  const zone = timeZoneOf(activity);

  if (activity.repeatType === 'once') {
    return combineDateAndTime(activity.scheduledDate, activity.scheduledTime, zone);
  }

  return combineDateAndTime(dateKey, activity.scheduledTime, zone);
}

function activityOccursOnDate(activity, dateKey) {
  if (!isActive(activity)) return false;

  if (compareDateKeys(dateKey, activity.scheduledDate) < 0) return false;

  if (activity.repeatType === 'once') return dateKey === activity.scheduledDate;
  if (activity.repeatType === 'daily') return true;

  if (activity.repeatType === 'weekly') {
    const weekday = weekdayFromDateKey(dateKey);
    return weekday !== null && (activity.weekdays ?? []).includes(weekday);
  }

  return false;
}

/** Forma pública que consume el familiar (HU-012 a HU-015). */
function toPublicActivity(activity) {
  const icon = getActivityIcon(activity.icon);
  const zone = timeZoneOf(activity);
  const scheduledAt = combineDateAndTime(activity.scheduledDate, activity.scheduledTime, zone);

  return {
    _id: activity.id,
    olderAdult: activity.seniorId,
    title: activity.title,
    icon: activity.icon ?? 'otro',
    iconLabel: icon.label,
    iconEmoji: icon.emoji,
    scheduledAt,
    date: activity.scheduledDate,
    time: activity.scheduledTime,
    timeZone: zone,
    repeatType: activity.repeatType ?? 'once',
    weekdays: activity.weekdays ?? [],
    repeatSummary: formatRepeatSummary(activity.repeatType ?? 'once', activity.weekdays ?? []),
    active: isActive(activity),
    createdAt: activity.createdAt,
    updatedAt: activity.updatedAt
  };
}

/**
 * Una actividad del día para la app del adulto mayor (HU-017) y para la vista
 * del familiar (HU-020). `completion` es la marca de esa ocurrencia, si existe.
 */
function toDayItem(activity, dateKey, completion) {
  const icon = getActivityIcon(activity.icon);
  const zone = timeZoneOf(activity);
  const instant = occurrenceInstant(activity, dateKey);

  return {
    _id: activity.id,
    title: activity.title,
    icon: activity.icon ?? 'otro',
    iconLabel: icon.label,
    iconEmoji: icon.emoji,
    scheduledAt: instant,
    time: activity.scheduledTime,
    repeatType: activity.repeatType ?? 'once',
    repeatSummary: formatRepeatSummary(activity.repeatType ?? 'once', activity.weekdays ?? []),
    completed: Boolean(completion),
    completedAt: completion?.completedAt ?? null,
    expiresAt: new Date(instant.getTime() + EXPIRATION_GRACE_MS)
  };
}

/**
 * HU-020: estado de una ocurrencia. Se separa del acceso a datos para poder
 * probar el umbral de 30 minutos sin MongoDB.
 */
function dayStatus({ completed, expiresAt, now }) {
  if (completed) return 'completed';

  return now.getTime() >= expiresAt.getTime() ? 'expired' : 'pending';
}

/** Hora válida de una marca enviada por el celular (HU-019). */
function resolveCompletionInstant(value, now = new Date()) {
  if (value === undefined || value === null || value === '') {
    return now;
  }

  if (typeof value !== 'string') {
    throw new AppError('La hora de la marca no es válida.', {
      statusCode: 400,
      code: 'COMPLETION_TIME_INVALID'
    });
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime()) || date.getTime() > now.getTime() + COMPLETION_CLOCK_SKEW_MS) {
    throw new AppError('La hora de la marca no es válida.', {
      statusCode: 400,
      code: 'COMPLETION_TIME_INVALID'
    });
  }

  return date;
}

module.exports = {
  ACTIVITY_ICONS,
  ACTIVITY_ICON_KEYS,
  COMPLETION_CLOCK_SKEW_MS,
  DEFAULT_TIME_ZONE,
  EXPIRATION_GRACE_MINUTES,
  EXPIRATION_GRACE_MS,
  MESSAGES,
  REPEAT_TYPES,
  activityOccursOnDate,
  dayStatus,
  getActivityIcon,
  isActive,
  occurrenceInstant,
  resolveCompletionInstant,
  timeZoneOf,
  toDayItem,
  toPublicActivity,
  validateActivityInput
};
