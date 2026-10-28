const WEEKDAY_LABELS = [
  'Domingo',
  'Lunes',
  'Martes',
  'Miércoles',
  'Jueves',
  'Viernes',
  'Sábado',
];

const WEEKDAY_SHORT_TO_INDEX = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

function getParts(date, timeZone) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    weekday: 'short',
    hourCycle: 'h23',
  });

  const parts = formatter.formatToParts(date);
  const values = {};

  for (const part of parts) {
    if (part.type !== 'literal') values[part.type] = part.value;
  }

  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    hour: Number(values.hour),
    minute: Number(values.minute),
    second: Number(values.second),
    weekday: WEEKDAY_SHORT_TO_INDEX[values.weekday] ?? 0,
  };
}

function pad(value) {
  return String(value).padStart(2, '0');
}

function getDateKey(date, timeZone) {
  const parts = getParts(date, timeZone);
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`;
}

function getTimeKey(date, timeZone) {
  const parts = getParts(date, timeZone);
  return `${pad(parts.hour)}:${pad(parts.minute)}`;
}

function getWeekday(date, timeZone) {
  return getParts(date, timeZone).weekday;
}

function getOffsetMs(date, timeZone) {
  const parts = getParts(date, timeZone);
  const asUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second
  );
  return asUtc - date.getTime();
}

function zonedDateTimeToUtc({ year, month, day, hour, minute }, timeZone) {
  const utcGuess = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
  let result = new Date(utcGuess - getOffsetMs(new Date(utcGuess), timeZone));
  result = new Date(utcGuess - getOffsetMs(result, timeZone));
  return result;
}

function parseDateKey(dateKey) {
  if (typeof dateKey !== 'string') return null;

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey.trim());
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const check = new Date(Date.UTC(year, month - 1, day));

  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() !== month - 1 ||
    check.getUTCDate() !== day
  ) {
    return null;
  }

  return { year, month, day };
}

function parseTimeKey(timeKey) {
  if (typeof timeKey !== 'string') return null;

  const match = /^(\d{2}):(\d{2})$/.exec(timeKey.trim());
  if (!match) return null;

  const hour = Number(match[1]);
  const minute = Number(match[2]);

  if (hour > 23 || minute > 59) return null;

  return { hour, minute };
}

function dateKeyToUtcDate(dateKey) {
  const parts = parseDateKey(dateKey);
  if (!parts) return null;
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day, 12, 0, 0, 0));
}

function addDaysToDateKey(dateKey, days) {
  const date = dateKeyToUtcDate(dateKey);
  if (!date) return null;

  date.setUTCDate(date.getUTCDate() + days);
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

function weekdayFromDateKey(dateKey) {
  const date = dateKeyToUtcDate(dateKey);
  return date ? date.getUTCDay() : null;
}

function combineDateAndTime(dateKey, timeKey, timeZone) {
  const dateParts = parseDateKey(dateKey);
  const timeParts = parseTimeKey(timeKey);

  if (!dateParts || !timeParts) return null;

  return zonedDateTimeToUtc({ ...dateParts, ...timeParts }, timeZone);
}

function compareDateKeys(left, right) {
  return String(left).localeCompare(String(right));
}

function formatRepeatSummary(repeatType, weekdays = []) {
  if (repeatType === 'daily') return 'Todos los días';
  if (repeatType === 'weekly') {
    const sorted = [...new Set(weekdays)].sort(
      (left, right) => (left === 0 ? 7 : left) - (right === 0 ? 7 : right)
    );
    const labels = sorted.map((index) => WEEKDAY_LABELS[index]).filter(Boolean);

    if (labels.length === 0) return 'Días de la semana';
    if (labels.length === 1) return labels[0];

    return `${labels.slice(0, -1).join(', ')} y ${labels[labels.length - 1]}`;
  }

  return 'Una sola vez';
}

module.exports = {
  WEEKDAY_LABELS,
  addDaysToDateKey,
  combineDateAndTime,
  compareDateKeys,
  formatRepeatSummary,
  getDateKey,
  getParts,
  getTimeKey,
  getWeekday,
  parseDateKey,
  parseTimeKey,
  weekdayFromDateKey,
  zonedDateTimeToUtc,
};
