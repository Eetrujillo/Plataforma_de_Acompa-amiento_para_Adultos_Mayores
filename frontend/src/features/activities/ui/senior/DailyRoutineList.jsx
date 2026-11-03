import { StatusBadge } from '../../../../shared/components/StatusBadge.jsx';
import { PrimaryButton } from '../../../../shared/components/PrimaryButton.jsx';
import { describeProgress, isCompleted } from '../../domain/activity.js';
import { formatLongDate } from '../../../../shared/utils/date.js';

export function DailyRoutineList({ routine, loading, error, busyActivityId, onComplete, onReload }) {
  if (loading) {
    return <p className="muted">Cargando tu rutina de hoy…</p>;
  }

  if (error) {
    return (
      <div>
        <p className="alert alert--error" role="alert">
          {error}
        </p>
        {onReload ? (
          <PrimaryButton variant="secondary" onClick={onReload}>
            Reintentar
          </PrimaryButton>
        ) : null}
      </div>
    );
  }

  return (
    <div>
      <p className="muted">{formatLongDate(routine.date)}</p>
      <p className="progress">{describeProgress(routine.progress)}</p>

      {routine.activities.length === 0 ? (
        <p>Todavía no hay actividades para hoy.</p>
      ) : (
        <ul className="list">
          {routine.activities.map((activity) => (
            <li className="list__item" key={activity.id}>
              <div>
                <strong>
                  {activity.scheduledTime} · {activity.title}
                </strong>
                {activity.description ? <p className="muted">{activity.description}</p> : null}
              </div>
              <div className="stack">
                <StatusBadge status={activity.status} />
                {!isCompleted(activity) && onComplete ? (
                  <PrimaryButton
                    variant="secondary"
                    onClick={() => onComplete(activity.id)}
                    disabled={busyActivityId === activity.id}
                  >
                    {busyActivityId === activity.id ? 'Guardando…' : 'Ya la hice'}
                  </PrimaryButton>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
