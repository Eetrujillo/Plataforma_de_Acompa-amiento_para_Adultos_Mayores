import { isCompleted, isExpired } from '../../domain/activity.js';

const STATUS_LABEL = Object.freeze({
  done: 'Completada',
  pending: 'Pendiente',
  alert: 'Expirada'
});

const BADGE_CLASS = Object.freeze({
  done: 'badge badge--completed',
  pending: 'badge badge--pending',
  alert: 'badge badge--alert'
});

const DOT_CLASS = Object.freeze({
  done: 'timeline__dot timeline__dot--done',
  pending: 'timeline__dot timeline__dot--pending',
  alert: 'timeline__dot timeline__dot--alert'
});

function activityStatus(activity) {
  if (isCompleted(activity)) {
    return 'done';
  }

  return isExpired(activity) ? 'alert' : 'pending';
}

/**
 * Línea del día del lobby (artboard 02): todas las actividades de hoy de las
 * personas a cargo, ordenadas por hora, con su estado. Los datos llegan ya
 * cargados por las tarjetas de resumen (sin pedidos extra al backend).
 */
export function DailyTimeline({ entries = [] }) {
  const events = entries
    .flatMap(({ senior, routine }) =>
      (routine?.activities ?? []).map((activity) => ({
        seniorName: senior.fullName,
        time: activity.scheduledTime,
        title: activity.title,
        status: activityStatus(activity)
      }))
    )
    .sort((a, b) => String(a.time).localeCompare(String(b.time)));

  if (events.length === 0) {
    return null;
  }

  return (
    <section className="card" aria-labelledby="daily-timeline-title">
      <h2 className="card__title" id="daily-timeline-title">Línea del día</h2>
      <p className="card__hint">Lo que pasó hoy en las rutinas de tus personas a cargo.</p>

      <ul className="timeline">
        {events.map((event, index) => (
          <li className="timeline__item" key={`${event.seniorName}-${event.time}-${event.title}-${index}`}>
            <span className="timeline__time">{event.time}</span>
            <span className={DOT_CLASS[event.status]} aria-hidden="true"></span>
            <span className="timeline__label">
              {event.title} <span className="timeline__who">· {event.seniorName}</span>
            </span>
            <span className={BADGE_CLASS[event.status]}>{STATUS_LABEL[event.status]}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
