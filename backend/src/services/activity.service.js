const mongoose = require('mongoose');
const Activity = require('../models/Activity');
const ActivityCompletion = require('../models/ActivityCompletion');
const OlderAdult = require('../models/OlderAdult');
const {
  ACTIVITY_ICON_KEYS,
  REPEAT_TYPES,
  getActivityIcon,
} = require('../constants/activity');
const {
  combineDateAndTime,
  compareDateKeys,
  formatRepeatSummary,
  getDateKey,
  getTimeKey,
  parseDateKey,
  parseTimeKey,
  weekdayFromDateKey,
} = require('../utils/dateTime');

/**
 * HU-019: la marca puede llegar desde el celular despues de un rato sin
 * conexion, asi que el cliente envia la hora real del toque. Solo se tolera un
 * desfase de reloj pequeno hacia el futuro; una hora pasada se acepta tal cual.
 */
const COMPLETION_CLOCK_SKEW_MS = 10 * 60 * 1000;

/**
 * HU-020: una actividad queda vencida 30 minutos despues de su hora si el
 * adulto mayor no la marco. El umbral vive solo aqui: el cliente recibe
 * `expiresAt` ya calculado y no repite la regla de negocio.
 */
const EXPIRATION_GRACE_MINUTES = 30;
const EXPIRATION_GRACE_MS = EXPIRATION_GRACE_MINUTES * 60 * 1000;

const MESSAGES = {
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
    'La fecha y hora ya pasaron. Confirma que deseas guardarla o corrige los datos.',
  olderAdultNotFound: 'Perfil no encontrado.',
  activityNotFound: 'Actividad no encontrada.',
  notOccurred: 'La actividad no corresponde a la fecha indicada.',
};

function validationError(field, code, message) {
  return { status: 'invalid', field, code, message };
}

function normalizeTitle(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeWeekdays(value) {
  if (!Array.isArray(value)) return [];

  return [...new Set(value.map(Number).filter((day) => Number.isInteger(day) && day >= 0 && day <= 6))]
    .sort((a, b) => a - b);
}

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
  previousScheduledAt = null,
}) {
  const normalizedTitle = normalizeTitle(title);
  const normalizedRepeat = repeatType || 'once';
  const normalizedWeekdays = normalizeWeekdays(weekdays);

  if (!normalizedTitle) {
    return validationError('title', 'ACTIVITY_TITLE_REQUIRED', MESSAGES.titleRequired);
  }

  if (normalizedTitle.length > 60) {
    return validationError('title', 'ACTIVITY_TITLE_TOO_LONG', MESSAGES.titleTooLong);
  }

  if (!icon) {
    return validationError('icon', 'ACTIVITY_ICON_REQUIRED', MESSAGES.iconRequired);
  }

  if (!ACTIVITY_ICON_KEYS.includes(icon)) {
    return validationError('icon', 'ACTIVITY_ICON_INVALID', MESSAGES.iconInvalid);
  }

  if (!date) {
    return validationError('date', 'ACTIVITY_DATE_REQUIRED', MESSAGES.dateRequired);
  }

  if (!time) {
    return validationError('time', 'ACTIVITY_TIME_REQUIRED', MESSAGES.timeRequired);
  }

  if (!parseDateKey(date) || !parseTimeKey(time)) {
    return validationError('date', 'ACTIVITY_DATE_TIME_INVALID', MESSAGES.dateTimeInvalid);
  }

  if (!REPEAT_TYPES.includes(normalizedRepeat)) {
    return validationError('repeatType', 'ACTIVITY_REPEAT_INVALID', MESSAGES.repeatInvalid);
  }

  if (normalizedRepeat === 'weekly' && normalizedWeekdays.length === 0) {
    return validationError(
      'weekdays',
      'ACTIVITY_WEEKDAYS_REQUIRED',
      MESSAGES.weekdaysRequired
    );
  }

  const scheduledAt = combineDateAndTime(date, time, timeZone);
  if (!scheduledAt) {
    return validationError('date', 'ACTIVITY_DATE_TIME_INVALID', MESSAGES.dateTimeInvalid);
  }

  const previousTime =
    previousScheduledAt instanceof Date ? previousScheduledAt.getTime() : null;
  const isSameMoment = previousTime !== null && scheduledAt.getTime() === previousTime;

  if (scheduledAt.getTime() <= now.getTime() && !confirmPast && !isSameMoment) {
    return {
      status: 'past_requires_confirmation',
      field: 'scheduledAt',
      code: 'ACTIVITY_PAST_REQUIRES_CONFIRMATION',
      message: MESSAGES.pastRequiresConfirmation,
      scheduledAt,
    };
  }

  return {
    status: 'valid',
    values: {
      title: normalizedTitle,
      icon,
      scheduledAt,
      timeZone,
      repeatType: normalizedRepeat,
      weekdays: normalizedRepeat === 'weekly' ? normalizedWeekdays : [],
    },
  };
}

function publicActivity(activity) {
  const icon = getActivityIcon(activity.icon);
  const timeZone = activity.timeZone;

  return {
    _id: activity._id,
    olderAdult: activity.olderAdult,
    title: activity.title,
    icon: activity.icon,
    iconLabel: icon.label,
    iconEmoji: icon.emoji,
    scheduledAt: activity.scheduledAt,
    date: getDateKey(activity.scheduledAt, timeZone),
    time: getTimeKey(activity.scheduledAt, timeZone),
    timeZone,
    repeatType: activity.repeatType,
    weekdays: activity.weekdays,
    repeatSummary: formatRepeatSummary(activity.repeatType, activity.weekdays),
    active: activity.active,
    createdAt: activity.createdAt,
    updatedAt: activity.updatedAt,
  };
}

function publicCompletion(completion) {
  return {
    _id: completion._id,
    activity: completion.activity,
    occurrenceDate: completion.occurrenceDate,
    completedAt: completion.completedAt,
    snapshot: completion.snapshot,
  };
}

async function findOwnedOlderAdult({ familiarId, olderAdultId }) {
  if (!mongoose.Types.ObjectId.isValid(olderAdultId)) return null;
  return OlderAdult.findOne({ _id: olderAdultId, familiar: familiarId });
}

async function createActivity({
  familiarId,
  olderAdultId,
  title,
  icon,
  date,
  time,
  repeatType,
  weekdays,
  confirmPast,
  now = new Date(),
}) {
  const olderAdult = await findOwnedOlderAdult({ familiarId, olderAdultId });
  if (!olderAdult) return { status: 'not_found' };

  const validation = validateActivityInput({
    title,
    icon,
    date,
    time,
    repeatType,
    weekdays,
    confirmPast,
    timeZone: olderAdult.timeZone,
    now,
  });

  if (validation.status !== 'valid') return validation;

  const activity = await Activity.create({
    familiar: familiarId,
    olderAdult: olderAdult._id,
    ...validation.values,
  });

  return { status: 'created', activity: publicActivity(activity) };
}

async function listActivities({ familiarId, olderAdultId }) {
  const filter = { familiar: familiarId, active: true };

  if (olderAdultId) {
    if (!mongoose.Types.ObjectId.isValid(olderAdultId)) return [];
    filter.olderAdult = olderAdultId;
  }

  const activities = await Activity.find(filter).sort({ scheduledAt: 1, createdAt: 1 });
  return activities.map(publicActivity);
}

async function getActivity({ familiarId, id }) {
  if (!mongoose.Types.ObjectId.isValid(id)) return null;

  const activity = await Activity.findOne({ _id: id, familiar: familiarId, active: true });
  return activity ? publicActivity(activity) : null;
}

async function updateActivity({
  familiarId,
  id,
  title,
  icon,
  date,
  time,
  repeatType,
  weekdays,
  confirmPast,
  now = new Date(),
}) {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return { status: 'not_found' };
  }

  const activity = await Activity.findOne({ _id: id, familiar: familiarId, active: true });
  if (!activity) {
    return { status: 'not_found' };
  }

  const olderAdult = await OlderAdult.findOne({
    _id: activity.olderAdult,
    familiar: familiarId,
  });
  const timeZone = olderAdult?.timeZone || activity.timeZone;

  const validation = validateActivityInput({
    title,
    icon,
    date,
    time,
    repeatType,
    weekdays,
    confirmPast,
    timeZone,
    now,
    previousScheduledAt: activity.scheduledAt,
  });

  if (validation.status !== 'valid') return validation;

  activity.title = validation.values.title;
  activity.icon = validation.values.icon;
  activity.scheduledAt = validation.values.scheduledAt;
  activity.timeZone = validation.values.timeZone;
  activity.repeatType = validation.values.repeatType;
  activity.weekdays = validation.values.weekdays;

  await activity.save();

  return { status: 'updated', activity: publicActivity(activity) };
}

async function deleteActivity({ familiarId, id, now = new Date() }) {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return { status: 'not_found' };
  }

  const activity = await Activity.findOne({ _id: id, familiar: familiarId, active: true });
  if (!activity) {
    return { status: 'not_found' };
  }

  activity.active = false;
  activity.deletedAt = now;
  await activity.save();

  return { status: 'deleted', activity: publicActivity(activity) };
}

function activityOccursOnDate(activity, dateKey) {
  if (!activity.active) return false;

  const startDateKey = getDateKey(activity.scheduledAt, activity.timeZone);
  if (compareDateKeys(dateKey, startDateKey) < 0) return false;

  if (activity.repeatType === 'once') {
    return dateKey === startDateKey;
  }

  if (activity.repeatType === 'daily') {
    return true;
  }

  if (activity.repeatType === 'weekly') {
    return activity.weekdays.includes(weekdayFromDateKey(dateKey));
  }

  return false;
}

function occurrenceForDate(activity, dateKey) {
  if (!activityOccursOnDate(activity, dateKey)) return null;

  if (activity.repeatType === 'once') {
    return activity.scheduledAt;
  }

  return combineDateAndTime(
    dateKey,
    getTimeKey(activity.scheduledAt, activity.timeZone),
    activity.timeZone
  );
}

async function listOccurrencesForDate({ olderAdult, dateKey, now = new Date() }) {
  const targetDate = parseDateKey(dateKey)
    ? dateKey
    : getDateKey(now, olderAdult.timeZone);

  const activities = await Activity.find({
    olderAdult: olderAdult._id,
    active: true,
  }).sort({ scheduledAt: 1, createdAt: 1 });

  const occurrences = activities
    .map((activity) => {
      const occurrence = occurrenceForDate(activity, targetDate);
      if (!occurrence) return null;

      return {
        activity,
        occurrence,
      };
    })
    .filter(Boolean)
    .sort((left, right) => left.occurrence.getTime() - right.occurrence.getTime());

  const completions = await ActivityCompletion.find({
    olderAdult: olderAdult._id,
    occurrenceDate: targetDate,
  });
  const completionByActivity = new Map(
    completions.map((completion) => [String(completion.activity), completion])
  );

  return {
    date: targetDate,
    timeZone: olderAdult.timeZone,
    activities: occurrences.map(({ activity, occurrence }) => {
      const icon = getActivityIcon(activity.icon);
      const completion = completionByActivity.get(String(activity._id));

      return {
        _id: activity._id,
        title: activity.title,
        icon: activity.icon,
        iconLabel: icon.label,
        iconEmoji: icon.emoji,
        scheduledAt: occurrence,
        time: getTimeKey(occurrence, olderAdult.timeZone),
        repeatType: activity.repeatType,
        repeatSummary: formatRepeatSummary(activity.repeatType, activity.weekdays),
        completed: Boolean(completion),
        completedAt: completion?.completedAt || null,
      };
    }),
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

/**
 * HU-020 - Estado del dia visto por el familiar.
 *
 * Reutiliza el mismo calculo de ocurrencias de la app del adulto mayor, pero
 * acotado al familiar autenticado. Cada actividad sale como `pending`,
 * `completed` o `expired`, y con `expiresAt` para que el cliente pueda pasar a
 * "Vencida" sin esperar al siguiente refresco.
 */
async function listDayForFamily({ familiarId, olderAdultId, dateKey, now = new Date() }) {
  if (!olderAdultId) return { status: 'older_adult_required' };
  if (!mongoose.Types.ObjectId.isValid(olderAdultId)) return { status: 'not_found' };

  const olderAdult = await OlderAdult.findOne({ _id: olderAdultId, familiar: familiarId });
  if (!olderAdult) return { status: 'not_found' };

  if (dateKey !== undefined && dateKey !== null && String(dateKey).trim() !== '') {
    if (!parseDateKey(dateKey)) return { status: 'invalid_date' };
  }

  const day = await listOccurrencesForDate({ olderAdult, dateKey, now });

  return {
    status: 'ok',
    day: {
      date: day.date,
      timeZone: day.timeZone,
      olderAdult: {
        _id: olderAdult._id,
        name: olderAdult.name,
        timeZone: olderAdult.timeZone,
      },
      activities: day.activities.map((activity) => {
        const expiresAt = new Date(activity.scheduledAt.getTime() + EXPIRATION_GRACE_MS);

        return {
          ...activity,
          expiresAt,
          status: dayStatus({ completed: activity.completed, expiresAt, now }),
        };
      }),
    },
  };
}

function resolveCompletionInstant(value, now) {
  if (value === undefined || value === null || value === '') {
    return { status: 'valid', date: now };
  }

  if (typeof value !== 'string') return { status: 'invalid' };

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return { status: 'invalid' };
  if (date.getTime() > now.getTime() + COMPLETION_CLOCK_SKEW_MS) {
    return { status: 'invalid' };
  }

  return { status: 'valid', date };
}

async function completeOccurrence({
  olderAdult,
  activityId,
  dateKey,
  completedAt,
  now = new Date(),
}) {
  if (!mongoose.Types.ObjectId.isValid(activityId)) {
    return { status: 'not_found' };
  }

  const targetDate = parseDateKey(dateKey)
    ? dateKey
    : getDateKey(now, olderAdult.timeZone);

  const activity = await Activity.findOne({
    _id: activityId,
    olderAdult: olderAdult._id,
    active: true,
  });

  if (!activity) {
    return { status: 'not_found' };
  }

  const occurrence = occurrenceForDate(activity, targetDate);
  if (!occurrence) {
    return { status: 'not_occurred' };
  }

  // HU-019: la hora que se guarda es la del toque en el celular, no la de llegada.
  const completionInstant = resolveCompletionInstant(completedAt, now);
  if (completionInstant.status !== 'valid') {
    return { status: 'invalid_completed_at' };
  }

  // La hora se fija solo al crear el registro. Si el adulto mayor toca el botón
  // dos veces seguidas, la segunda llamada no mueve la hora de la primera
  // confirmación: queda una sola marca con la hora real del primer toque.
  const completion = await ActivityCompletion.findOneAndUpdate(
    { activity: activity._id, occurrenceDate: targetDate },
    {
      $set: {
        olderAdult: olderAdult._id,
        snapshot: {
          title: activity.title,
          icon: activity.icon,
          time: getTimeKey(occurrence, olderAdult.timeZone),
          timeZone: olderAdult.timeZone,
          repeatSummary: formatRepeatSummary(activity.repeatType, activity.weekdays),
        },
      },
      $setOnInsert: {
        completedAt: completionInstant.date,
      },
    },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );

  return {
    status: 'completed',
    completion: publicCompletion(completion),
  };
}

async function undoOccurrence({ olderAdult, activityId, dateKey }) {
  if (!mongoose.Types.ObjectId.isValid(activityId)) {
    return { status: 'not_found' };
  }

  const targetDate = parseDateKey(dateKey) ? dateKey : null;
  if (!targetDate) {
    return { status: 'invalid_date' };
  }

  await ActivityCompletion.deleteOne({
    activity: activityId,
    olderAdult: olderAdult._id,
    occurrenceDate: targetDate,
  });

  return { status: 'undone' };
}

module.exports = {
  EXPIRATION_GRACE_MINUTES,
  MESSAGES,
  activityOccursOnDate,
  completeOccurrence,
  createActivity,
  dayStatus,
  deleteActivity,
  getActivity,
  listActivities,
  listDayForFamily,
  listOccurrencesForDate,
  occurrenceForDate,
  publicActivity,
  undoOccurrence,
  updateActivity,
  validateActivityInput,
};
