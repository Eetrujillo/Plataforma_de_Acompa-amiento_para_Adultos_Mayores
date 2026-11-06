import type { AppActivity, OlderAdultRepeatType } from '../types';

export const ACTIVITY_ICONS = [
  { key: 'medicina', label: 'Medicina', emoji: '💊' },
  { key: 'comida', label: 'Comida', emoji: '🍽️' },
  { key: 'ejercicio', label: 'Ejercicio', emoji: '🏃' },
  { key: 'cita', label: 'Cita médica', emoji: '📅' },
  { key: 'paseo', label: 'Paseo', emoji: '🌳' },
  { key: 'otro', label: 'Otro', emoji: '⭐' },
] as const;

export const REPEAT_OPTIONS: Array<{ value: OlderAdultRepeatType; label: string }> = [
  { value: 'once', label: 'Una sola vez' },
  { value: 'daily', label: 'Todos los días' },
  { value: 'weekly', label: 'Días de la semana' },
];

export const WEEKDAYS = [
  { value: 1, label: 'Lunes', short: 'Lun' },
  { value: 2, label: 'Martes', short: 'Mar' },
  { value: 3, label: 'Miércoles', short: 'Mié' },
  { value: 4, label: 'Jueves', short: 'Jue' },
  { value: 5, label: 'Viernes', short: 'Vie' },
  { value: 6, label: 'Sábado', short: 'Sáb' },
  { value: 0, label: 'Domingo', short: 'Dom' },
];

export const MONTHS = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
];

export function getActivityIcon(key: string) {
  return (
    ACTIVITY_ICONS.find((icon) => icon.key === key) ??
    ACTIVITY_ICONS[ACTIVITY_ICONS.length - 1]
  );
}

function weekdayOrder(value: number) {
  return value === 0 ? 7 : value;
}

export function formatRepeatSummary(
  repeatType: OlderAdultRepeatType,
  weekdays: number[] = []
): string {
  if (repeatType === 'daily') return 'Todos los días';

  if (repeatType === 'weekly') {
    const sorted = [...new Set(weekdays)].sort(
      (left, right) => weekdayOrder(left) - weekdayOrder(right)
    );
    const labels = sorted
      .map((value) => WEEKDAYS.find((day) => day.value === value)?.label)
      .filter((label): label is string => Boolean(label));

    if (labels.length === 0) return 'Días de la semana';
    if (labels.length === 1) return labels[0] ?? 'Días de la semana';

    return `${labels.slice(0, -1).join(', ')} y ${labels[labels.length - 1]}`;
  }

  return 'Una sola vez';
}

/** Fecha de hoy en una zona horaria concreta (para crear actividades). */
export function getTodayDateKey(timeZone: string): string {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
  } catch {
    return getDeviceDateKey();
  }
}

/**
 * Fecha de hoy según la zona horaria del celular (regla de negocio de HU-017).
 * `Date` ya expresa sus componentes locales en la zona del dispositivo.
 */
export function getDeviceDateKey(now: Date = new Date()): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

/**
 * Hora visible calculada desde `scheduledAt` (instante absoluto) en la zona del
 * celular. Si el instante no es válido se usa la hora que calculó el backend.
 */
export function formatTimeFromInstant(scheduledAt: string, fallback = ''): string {
  const date = new Date(scheduledAt);
  if (Number.isNaN(date.getTime())) return fallback;

  try {
    return new Intl.DateTimeFormat('es-CO', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    }).format(date);
  } catch {
    return fallback;
  }
}

/**
 * Orden por hora. El backend ya entrega la lista ordenada; esto la protege de
 * una caché guardada con otro orden.
 */
export function sortActivitiesByTime<T extends { scheduledAt: string; time: string }>(
  activities: T[]
): T[] {
  return [...activities].sort((left, right) => {
    const leftInstant = Date.parse(left.scheduledAt);
    const rightInstant = Date.parse(right.scheduledAt);

    if (
      !Number.isNaN(leftInstant) &&
      !Number.isNaN(rightInstant) &&
      leftInstant !== rightInstant
    ) {
      return leftInstant - rightInstant;
    }

    return left.time.localeCompare(right.time);
  });
}

/** "miércoles, 5 de noviembre de 2026" sin depender de datos ICU del equipo. */
export function formatDateLabel(dateKey: string): string {
  const parts = parseDateKey(dateKey);
  if (!parts) return dateKey;

  const date = new Date(parts.year, parts.month - 1, parts.day);
  if (Number.isNaN(date.getTime())) return dateKey;

  try {
    return new Intl.DateTimeFormat('es-CO', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(date);
  } catch {
    return `${parts.day} de ${MONTHS[parts.month - 1] ?? ''} de ${parts.year}`;
  }
}

/** "05/11/2026" corto para listas. */
export function formatShortDate(dateKey: string): string {
  const parts = parseDateKey(dateKey);
  if (!parts) return dateKey;

  return `${String(parts.day).padStart(2, '0')}/${String(parts.month).padStart(2, '0')}/${parts.year}`;
}

/** "9:00 a. m." a partir de "09:00". */
export function formatTimeLabel(time: string): string {
  const match = /^(\d{2}):(\d{2})$/.exec(time);
  if (!match) return time;

  const date = new Date(
    Date.UTC(2026, 0, 1, Number(match[1]), Number(match[2]), 0, 0)
  );

  try {
    return new Intl.DateTimeFormat('es-CO', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZone: 'UTC',
    }).format(date);
  } catch {
    return time;
  }
}

export interface DateParts {
  year: number;
  month: number;
  day: number;
}

export function parseDateKey(dateKey: string): DateParts | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  return { year, month, day };
}

export function toDateKey({ year, month, day }: DateParts): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** Días que tiene un mes; evita ofrecer el 31 de febrero en el selector. */
export function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

export function isValidTime(time: string): boolean {
  const match = /^(\d{2}):(\d{2})$/.exec(time);
  if (!match) return false;

  const hours = Number(match[1]);
  const minutes = Number(match[2]);

  return hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59;
}

/** Hora ya pasada respecto al reloj del dispositivo (aviso de confirmación). */
export function isPastDateTime(dateKey: string, time: string): boolean {
  const parts = parseDateKey(dateKey);
  if (!parts || !isValidTime(time)) return false;

  const [hoursText, minutesText] = time.split(':');
  const date = new Date(
    parts.year,
    parts.month - 1,
    parts.day,
    Number(hoursText),
    Number(minutesText),
    0,
    0
  );

  if (Number.isNaN(date.getTime())) return false;

  return date.getTime() < Date.now();
}

/** Resumen de repetición de una actividad tal como la muestra la app. */
export function summarizeActivity(activity: AppActivity): string {
  return `${formatTimeFromInstant(activity.scheduledAt, formatTimeLabel(activity.time))} · ${
    activity.repeatSummary
  }`;
}
