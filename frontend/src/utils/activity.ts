import type { OlderAdultRepeatType } from '../types';

export const ACTIVITY_ICONS = [
  { key: 'medicina', label: 'Medicina', emoji: '💊' },
  { key: 'comida', label: 'Comida', emoji: '🍽️' },
  { key: 'ejercicio', label: 'Ejercicio', emoji: '🏃' },
  { key: 'cita', label: 'Cita médica', emoji: '📅' },
  { key: 'paseo', label: 'Paseo', emoji: '🌳' },
  { key: 'otro', label: 'Otro', emoji: '⭐' },
];

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

export function getActivityIcon(key: string) {
  return ACTIVITY_ICONS.find((icon) => icon.key === key) ?? ACTIVITY_ICONS[ACTIVITY_ICONS.length - 1];
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
    if (labels.length === 1) return labels[0];

    return `${labels.slice(0, -1).join(', ')} y ${labels[labels.length - 1]}`;
  }

  return 'Una sola vez';
}

export function getTodayDateKey(timeZone: string): string {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

export function formatDateLabel(dateKey: string): string {
  const date = new Date(`${dateKey}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return dateKey;

  try {
    return new Intl.DateTimeFormat('es-CO', {
      dateStyle: 'full',
      timeZone: 'UTC',
    }).format(date);
  } catch {
    return dateKey;
  }
}

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
