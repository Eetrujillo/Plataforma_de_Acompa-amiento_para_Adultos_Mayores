export const ACTIVITY_STATUS = Object.freeze({
  PENDING: 'PENDING',
  COMPLETED: 'COMPLETED',
  SKIPPED: 'SKIPPED'
});

export function isCompleted(activity) {
  return activity?.status === ACTIVITY_STATUS.COMPLETED;
}

export function describeProgress(progress) {
  if (!progress || typeof progress.total !== 'number') {
    return '';
  }

  return `${progress.completed} de ${progress.total} completadas`;
}
