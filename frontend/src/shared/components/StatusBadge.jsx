const STATUS_LABELS = {
  PENDING: 'Pendiente',
  COMPLETED: 'Completada',
  SKIPPED: 'Omitida'
};

export function StatusBadge({ status }) {
  const modifier = status === 'COMPLETED' ? 'badge--completed' : 'badge--pending';

  return <span className={`badge ${modifier}`}>{STATUS_LABELS[status] ?? status}</span>;
}
