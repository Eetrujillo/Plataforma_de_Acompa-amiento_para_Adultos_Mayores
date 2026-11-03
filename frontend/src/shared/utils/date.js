/**
 * Local calendar day as YYYY-MM-DD.
 *
 * `toISOString` would shift to UTC and show yesterday for evening users in
 * negative offsets, so the offset is removed before slicing.
 */
export function todayIsoDate(now = new Date()) {
  const offsetMs = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offsetMs).toISOString().slice(0, 10);
}

export function formatLongDate(isoDate) {
  if (typeof isoDate !== 'string') {
    return '';
  }

  const [year, month, day] = isoDate.split('-').map(Number);

  if (!year || !month || !day) {
    return isoDate;
  }

  return new Date(year, month - 1, day).toLocaleDateString('es-AR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long'
  });
}
