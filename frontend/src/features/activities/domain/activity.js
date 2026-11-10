export const ACTIVITY_STATUS = Object.freeze({
  PENDING: 'PENDING',
  COMPLETED: 'COMPLETED',
  SKIPPED: 'SKIPPED'
});

export function isCompleted(activity) {
  return activity?.status === ACTIVITY_STATUS.COMPLETED;
}

/**
 * Una actividad pendiente cuya hora ya pasó queda expirada para hoy.
 * Compartida por las tarjetas de resumen y la línea del día del cuidador.
 */
export function isExpired(activity) {
  if (!activity || isCompleted(activity)) {
    return false;
  }

  const [hours, minutes] = String(activity.scheduledTime ?? '').split(':').map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) {
    return false;
  }

  const scheduled = new Date();
  scheduled.setHours(hours, minutes, 0, 0);

  return scheduled.getTime() < Date.now();
}

export function describeProgress(progress) {
  if (!progress || typeof progress.total !== 'number') {
    return '';
  }

  return `${progress.completed} de ${progress.total} completadas`;
}
